import { Component } from "@angular/core";
import { Router } from "@angular/router";

import { Config, IonRouterOutlet, PopoverController } from "@ionic/angular";
import { WebcamImage } from "ngx-webcam";
import { Observable, Subject } from "rxjs";
import { UserData } from "../../providers/user-data";

import { PopoverPage } from "../about-popover/about-popover";
import {
  FormRecognizerClient,
  AzureKeyCredential,
} from "@azure/ai-form-recognizer";
const axios = require("axios");

@Component({
  selector: "ingest-page",
  templateUrl: "about.html",
  styleUrls: ["./about.scss"],
})
export class IngestPage {
  ios: boolean;
  private trigger: Subject<void> = new Subject<void>();
  public webcamImage: WebcamImage = null;
  items = null;

  merchant: string = "";

  constructor(
    public router: Router,
    public routerOutlet: IonRouterOutlet,
    public user: UserData,
    public config: Config,
    public popoverCtrl: PopoverController
  ) {}

  ngOnInit() {
    this.ios = this.config.get("mode") === "ios";
  }

  async presentPopover(event: Event) {
    const popover = await this.popoverCtrl.create({
      component: PopoverPage,
      event,
    });
    await popover.present();
  }
  takePicture() {
    this.trigger.next();
  }

  selectFile() {
    fetch("/assets/data/REWE-eBon.pdf")
      .then(async (res) => res.blob())
      .then(async (blob) => {
        await this.analyzeImage(blob);
      });
  }

  public async handleImage(webcamImage: WebcamImage) {
    console.info("received webcam image", webcamImage);
    this.webcamImage = webcamImage;
    fetch(this.webcamImage.imageAsDataUrl)
      .then(async (res) => res.blob())
      .then(async (blob) => {
        await this.analyzeImage(blob);
      });
  }

  public get triggerObservable(): Observable<void> {
    return this.trigger.asObservable();
  }

  private async analyzeImage(blob) {
    const endpoint = "https://germanywestcentral.api.cognitive.microsoft.com/";
    const apiKey = "86ff30ca03de45139e14598e58535a2b";

    const client = new FormRecognizerClient(
      endpoint,
      new AzureKeyCredential(apiKey)
    );

    const poller = await client.beginRecognizeReceipts(blob as any, {
      onProgress: (state) => {
        console.log(`status: ${state.status}`);
      },
    });

    let receipts = await poller.pollUntilDone();

    if (!receipts || receipts.length <= 0) {
      throw new Error("Expecting at lease one receipt in analysis result");
    }

    const receipt = receipts[0];
    console.log("First receipt:");
    const receiptTypeField = receipt.fields["ReceiptType"];
    if (receiptTypeField.valueType === "string") {
      console.log(
        `  Receipt Type: '${
          receiptTypeField.value || "<missing>"
        }', with confidence of ${receiptTypeField.confidence}`
      );
    }
    const merchantNameField = receipt.fields["MerchantName"];
    if (merchantNameField.valueType === "string") {
      this.merchant = merchantNameField.value;
      console.log(
        `  Merchant Name: '${
          merchantNameField.value || "<missing>"
        }', with confidence of ${merchantNameField.confidence}`
      );
    }
    const transactionDate = receipt.fields["TransactionDate"];
    if (transactionDate.valueType === "date") {
      console.log(
        `  Transaction Date: '${
          transactionDate.value || "<missing>"
        }', with confidence of ${transactionDate.confidence}`
      );
    }
    const itemsField = receipt.fields["Items"];
    if (itemsField.valueType === "array") {
      for (const itemField of itemsField.value || []) {
        if (itemField.valueType === "object") {
          const itemNameField = itemField.value["Name"];
          if (itemNameField.valueType === "string") {
            console.log(
              `    Item Name: '${
                itemNameField.value || "<missing>"
              }', with confidence of ${itemNameField.confidence}`
            );
          }
        }
      }
    }
    const totalField = receipt.fields["Total"];
    if (totalField.valueType === "number") {
      console.log(
        `  Total: '${totalField.value || "<missing>"}', with confidence of ${
          totalField.confidence
        }`
      );
    }

    // Get Product IDs
    if (itemsField.valueType === "array") {
      this.items = [];

      for (const itemField of itemsField.value || []) {
        if (itemField.valueType === "object") {
          const itemNameField = itemField.value["Name"];
          if (itemNameField.valueType === "string") {
            this.items.push({ name: itemNameField.value });
            this.getProductId(itemNameField.value);
          }
        }
      }
    }
  }

  getProductId(productstring) {
    if (productstring == undefined) {
      console.log("product undefined");
      return;
    }
    var converteditem = getUsableProductName(productstring);
    //   console.log(
    //     `https://de.openfoodfacts.org/cgi/search.pl?search_terms=${converteditem}&search_simple=1&action=process&json=true`
    //   );
    axios
      .get(
        `https://de.openfoodfacts.org/cgi/search.pl?search_terms=${converteditem}&search_simple=1&action=process&json=true`,
        axiosconfig
      )
      .then((res) => {
        //   console.log(`statusCode: ${res.status}`);
        //   console.log(res.data);
        let jsonresponse = res.data;
        console.log(jsonresponse.count);
        if (jsonresponse.products.length == 0) {
          var splits = converteditem.split(" ")[0];
          splits.pop;
          axios
            .get(
              `https://de.openfoodfacts.org/cgi/search.pl?search_terms=${
                converteditem.split(" ")[0]
              }&search_simple=1&action=process&json=true`,
              axiosconfig
            )
            .then((res) => {
              //   console.log(`statusCode: ${res.status}`);
              //   console.log(res.data);
              let jsonresponse = res.data;
              console.log(
                `    Item Name: '${converteditem}' Request '${
                  converteditem.split(" ")[0]
                }' ${
                  jsonresponse.products.length > 0
                    ? jsonresponse.products[0].product_name
                    : "none found"
                }`
              );
            })
            .catch((error) => {
              console.error(error);
            });
        } else {
          let itemIndex = this.items.findIndex(
            (element) => element.name === productstring
          );

          this.items[itemIndex].newname = jsonresponse.products[0].product_name,
          this.items[itemIndex].quantity = jsonresponse.products[0].quantity,

          this.items = JSON.parse(JSON.stringify(this.items));
          console.log(
            `    Item Name: '${converteditem}' ${
              jsonresponse.products.length > 0
                ? jsonresponse.products[0].product_name
                : "none found"
            }`
          );
        }
      })
      .catch((error) => {
        console.error(error);
      });
  }
}

const axiosconfig = {
  headers: {
    "Content-Type": "application/json",
  },
};

function getUsableProductName(notUsableString) {
  const newString = notUsableString
    .toLowerCase()
    .replaceAll(/oe/gi, "ö")
    .replaceAll(/ae/gi, "ä")
    .replaceAll(/ue/gi, "ü")
    .replaceAll(".", " ");
  console.log(newString);
  return newString;
}

const json = {
  status: "succeeded",
  createdDateTime: "2022-06-01T09:11:40Z",
  lastUpdatedDateTime: "2022-06-01T09:11:45Z",
  analyzeResult: {
    apiVersion: "2022-01-30-preview",
    modelId: "prebuilt-receipt",
    stringIndexType: "textElements",
    content:
      "REWE\nGEBA Supermärkte GmbH & Co. KG\nBautzener Str.\n36\n10829 Berlin\nUID Nr.:\nDE242311334\nFRANZ.WEICHKAESE\nFRISCH.DOPPELRA.\nBAGELS SESAM\nROGGENBROETCHEN\nTRAUBE KERNL.HEL\nSOFT DATTELN\nAVOCADO VORGER.\nRISPENTOMATE\n0,568 kg x\nEUR\n1,39 B\n1,19 B\n1,49 B\n1,39 B\n1,99 B\n1,99 B\n1,49 B\n1,13 B\n1,99 EUR/kg\nBIO EIER S-XL\n3,49 B\n--------------------------------------\nSUMME\nEUR\n15,55\n======================================\nGeg. Mastercard\nEUR\n15,55\n*\n*\nKundenbeleg\n*\n*\nDatum:\n21.05.2022\nUhrzeit:\n11:35:17 Uhr\nBeleg-Nr.\n7700\nTrace-Nr.\n224875\nBezahlung\nContactless\nDEBIT MASTERCARD\nNr.\n############8719 0000\ngültig bis\n01/24\nVU-Nr.\n4556465581\nTerminal-ID\n56038840\nPos-Info\n00 075 00\nAS-Zeit 21.05.\n11:35 Uhr\nAS-Proc-Code = 00 075 00\nCapt.-Ref.= 0000\nAPPROVED\nBetrag EUR\n15,55\nZahlung erfolgt\nSteuer\n%\nB=\n7,0%\nGesamtbetrag\nNetto\n14,53\n14,53\nSteuer\n1,02\n1,02\nBrutto\n15,55\n15,55\nTSE-Signatur:\nCURezCxAege6BbDXvtcNRO13FbL6/E1zX\noyeC0BM7Kbgfnrbyh258bYpNQmRz40YcG\nxI+S19z9Fh5uyWGpt5azfzUQC9BnF9hAV\n6/gURcO7KOf63OzUPFx1KBcZVCb4i\nTSE-Signaturzähler:\n341392\nTSE-Transaktion:\n163235\nTSE-Start:\n2022-05-21T11:35:03.000\nTSE-Stop:\n2022-05-21T11:35:38.000\nSeriennnummer Kasse: REWE:e0:d5:5e:c6:d3:3a:00\n21.05.2022\n11:35\nBon-Nr.:5580\nMarkt:6008\nKasse:1\nBed.:404040\n****************************************\nIhre REWE PAYBACK Vorteile heute\nPAYBACK Karten-Nr.: #########0111\nPunktestand vor Einkauf: 1.031\nPunktestand entspricht: 10,31 EUR\nSie erhalten 7 PAYBACK Punkte auf\neinen PAYBACK Umsatz von 15,55 EUR!\nJetzt mit PAYBACK Punkten bezahlen!\nEinfach REWE Guthaben am Service-Punkt\naufladen.\n****************************************\nVielen Dank für Ihren Einkauf\nMo.\nWir sind für Sie da:\n-\nSa.\n07:00 bis 22:00 Uhr\nSie haben Fragen?\nAntworten gibt es unter www.rewe.de\nTel.: 030-20859548",
    pages: [
      {
        pageNumber: 1,
        angle: 0,
        width: 3.9306,
        height: 11.6806,
        unit: "inch",
        words: [
          {
            content: "REWE",
            boundingBox: [
              0.2587, 0.6134, 3.464, 0.6033, 3.4792, 1.6476, 0.2282, 1.5665,
            ],
            confidence: 0.981,
            span: {
              offset: 0,
              length: 4,
            },
          },
          {
            content: "GEBA",
            boundingBox: [
              0.6169, 2.1012, 0.9418, 2.1012, 0.9418, 2.2098, 0.6169, 2.2098,
            ],
            confidence: 1,
            span: {
              offset: 5,
              length: 4,
            },
          },
          {
            content: "Supermärkte",
            boundingBox: [
              1.0364, 2.0958, 1.9353, 2.0958, 1.9353, 2.236, 1.0364, 2.236,
            ],
            confidence: 1,
            span: {
              offset: 10,
              length: 11,
            },
          },
          {
            content: "GmbH",
            boundingBox: [
              2.0336, 2.0958, 2.3526, 2.0958, 2.3526, 2.21, 2.0336, 2.21,
            ],
            confidence: 1,
            span: {
              offset: 22,
              length: 4,
            },
          },
          {
            content: "&",
            boundingBox: [
              2.4504, 2.102, 2.5246, 2.102, 2.5246, 2.2102, 2.4504, 2.2102,
            ],
            confidence: 1,
            span: {
              offset: 27,
              length: 1,
            },
          },
          {
            content: "Co.",
            boundingBox: [
              2.6179, 2.1022, 2.8269, 2.1022, 2.8269, 2.21, 2.6179, 2.21,
            ],
            confidence: 1,
            span: {
              offset: 29,
              length: 3,
            },
          },
          {
            content: "KG",
            boundingBox: [
              2.9514, 2.1018, 3.1044, 2.1018, 3.1044, 2.2098, 2.9514, 2.2098,
            ],
            confidence: 1,
            span: {
              offset: 33,
              length: 2,
            },
          },
          {
            content: "Bautzener",
            boundingBox: [
              1.1191, 2.2697, 1.8541, 2.2697, 1.8541, 2.3767, 1.1191, 2.3767,
            ],
            confidence: 1,
            span: {
              offset: 36,
              length: 9,
            },
          },
          {
            content: "Str.",
            boundingBox: [
              1.9531, 2.2683, 2.2436, 2.2683, 2.2436, 2.3767, 1.9531, 2.3767,
            ],
            confidence: 1,
            span: {
              offset: 46,
              length: 4,
            },
          },
          {
            content: "36",
            boundingBox: [
              2.3726, 2.2685, 2.5176, 2.2685, 2.5176, 2.3767, 2.3726, 2.3767,
            ],
            confidence: 1,
            span: {
              offset: 51,
              length: 2,
            },
          },
          {
            content: "10829",
            boundingBox: [
              1.3758, 2.435, 1.7676, 2.435, 1.7676, 2.5433, 1.3758, 2.5433,
            ],
            confidence: 1,
            span: {
              offset: 54,
              length: 5,
            },
          },
          {
            content: "Berlin",
            boundingBox: [
              1.8691, 2.4292, 2.3496, 2.4292, 2.3496, 2.5432, 1.8691, 2.5432,
            ],
            confidence: 1,
            span: {
              offset: 60,
              length: 6,
            },
          },
          {
            content: "UID",
            boundingBox: [
              1.0361, 2.603, 1.2711, 2.603, 1.2711, 2.71, 1.0361, 2.71,
            ],
            confidence: 1,
            span: {
              offset: 67,
              length: 3,
            },
          },
          {
            content: "Nr.:",
            boundingBox: [
              1.3694, 2.603, 1.6608, 2.603, 1.6608, 2.71, 1.3694, 2.71,
            ],
            confidence: 1,
            span: {
              offset: 71,
              length: 4,
            },
          },
          {
            content: "DE242311334",
            boundingBox: [
              1.7868, 2.6023, 2.6898, 2.6023, 2.6898, 2.71, 1.7868, 2.71,
            ],
            confidence: 1,
            span: {
              offset: 76,
              length: 11,
            },
          },
          {
            content: "FRANZ.WEICHKAESE",
            boundingBox: [
              0.2908, 2.9345, 1.6013, 2.9345, 1.6013, 3.0433, 0.2908, 3.0433,
            ],
            confidence: 1,
            span: {
              offset: 88,
              length: 16,
            },
          },
          {
            content: "FRISCH.DOPPELRA.",
            boundingBox: [
              0.2908, 3.1012, 1.5769, 3.1012, 1.5769, 3.21, 0.2908, 3.21,
            ],
            confidence: 1,
            span: {
              offset: 105,
              length: 16,
            },
          },
          {
            content: "BAGELS",
            boundingBox: [
              0.2858, 3.2678, 0.7703, 3.2678, 0.7703, 3.3765, 0.2858, 3.3765,
            ],
            confidence: 1,
            span: {
              offset: 122,
              length: 6,
            },
          },
          {
            content: "SESAM",
            boundingBox: [
              0.8698, 3.2678, 1.2711, 3.2678, 1.2711, 3.3765, 0.8698, 3.3765,
            ],
            confidence: 1,
            span: {
              offset: 129,
              length: 5,
            },
          },
          {
            content: "ROGGENBROETCHEN",
            boundingBox: [
              0.2871, 3.4352, 1.5204, 3.4352, 1.5204, 3.5433, 0.2871, 3.5433,
            ],
            confidence: 1,
            span: {
              offset: 135,
              length: 15,
            },
          },
          {
            content: "TRAUBE",
            boundingBox: [
              0.2829, 3.6012, 0.7679, 3.6012, 0.7679, 3.71, 0.2829, 3.71,
            ],
            confidence: 1,
            span: {
              offset: 151,
              length: 6,
            },
          },
          {
            content: "KERNL.HEL",
            boundingBox: [
              0.8681, 3.6022, 1.6009, 3.6022, 1.6009, 3.71, 0.8681, 3.71,
            ],
            confidence: 1,
            span: {
              offset: 158,
              length: 9,
            },
          },
          {
            content: "SOFT",
            boundingBox: [
              0.2864, 3.7683, 0.6049, 3.7683, 0.6049, 3.8767, 0.2864, 3.8767,
            ],
            confidence: 1,
            span: {
              offset: 168,
              length: 4,
            },
          },
          {
            content: "DATTELN",
            boundingBox: [
              0.7034, 3.7678, 1.2704, 3.7678, 1.2704, 3.8752, 0.7034, 3.8752,
            ],
            confidence: 1,
            span: {
              offset: 173,
              length: 7,
            },
          },
          {
            content: "AVOCADO",
            boundingBox: [
              0.2804, 3.9345, 0.8566, 3.9345, 0.8566, 4.0433, 0.2804, 4.0433,
            ],
            confidence: 1,
            span: {
              offset: 181,
              length: 7,
            },
          },
          {
            content: "VORGER.",
            boundingBox: [
              0.9486, 3.9352, 1.4936, 3.9352, 1.4936, 4.0433, 0.9486, 4.0433,
            ],
            confidence: 1,
            span: {
              offset: 189,
              length: 7,
            },
          },
          {
            content: "RISPENTOMATE",
            boundingBox: [
              0.2871, 4.1012, 1.2679, 4.1012, 1.2679, 4.21, 0.2871, 4.21,
            ],
            confidence: 1,
            span: {
              offset: 197,
              length: 12,
            },
          },
          {
            content: "0,568",
            boundingBox: [
              1.0373, 4.2683, 1.4346, 4.2683, 1.4346, 4.4028, 1.0373, 4.4028,
            ],
            confidence: 1,
            span: {
              offset: 210,
              length: 5,
            },
          },
          {
            content: "kg",
            boundingBox: [
              1.5388, 4.2625, 1.6903, 4.2625, 1.6903, 4.4035, 1.5388, 4.4035,
            ],
            confidence: 1,
            span: {
              offset: 216,
              length: 2,
            },
          },
          {
            content: "x",
            boundingBox: [
              1.7856, 4.2977, 1.8538, 4.2977, 1.8538, 4.375, 1.7856, 4.375,
            ],
            confidence: 1,
            span: {
              offset: 219,
              length: 1,
            },
          },
          {
            content: "EUR",
            boundingBox: [
              3.2043, 2.7695, 3.4384, 2.7695, 3.4384, 2.8767, 3.2043, 2.8767,
            ],
            confidence: 1,
            span: {
              offset: 221,
              length: 3,
            },
          },
          {
            content: "1,39",
            boundingBox: [
              3.0424, 2.9357, 3.3509, 2.9357, 3.3509, 3.0695, 3.0424, 3.0695,
            ],
            confidence: 1,
            span: {
              offset: 225,
              length: 4,
            },
          },
          {
            content: "B",
            boundingBox: [
              3.4524, 2.9363, 3.5206, 2.9363, 3.5206, 3.0417, 3.4524, 3.0417,
            ],
            confidence: 1,
            span: {
              offset: 230,
              length: 1,
            },
          },
          {
            content: "1,19",
            boundingBox: [
              3.0424, 3.1023, 3.3509, 3.1023, 3.3509, 3.2362, 3.0424, 3.2362,
            ],
            confidence: 1,
            span: {
              offset: 232,
              length: 4,
            },
          },
          {
            content: "B",
            boundingBox: [
              3.4524, 3.103, 3.5206, 3.103, 3.5206, 3.2083, 3.4524, 3.2083,
            ],
            confidence: 1,
            span: {
              offset: 237,
              length: 1,
            },
          },
          {
            content: "1,49",
            boundingBox: [
              3.0424, 3.269, 3.3509, 3.269, 3.3509, 3.4028, 3.0424, 3.4028,
            ],
            confidence: 1,
            span: {
              offset: 239,
              length: 4,
            },
          },
          {
            content: "B",
            boundingBox: [
              3.4524, 3.2697, 3.5206, 3.2697, 3.5206, 3.375, 3.4524, 3.375,
            ],
            confidence: 1,
            span: {
              offset: 244,
              length: 1,
            },
          },
          {
            content: "1,39",
            boundingBox: [
              3.0424, 3.4357, 3.3509, 3.4357, 3.3509, 3.5695, 3.0424, 3.5695,
            ],
            confidence: 1,
            span: {
              offset: 246,
              length: 4,
            },
          },
          {
            content: "B",
            boundingBox: [
              3.4524, 3.4363, 3.5206, 3.4363, 3.5206, 3.5417, 3.4524, 3.5417,
            ],
            confidence: 1,
            span: {
              offset: 251,
              length: 1,
            },
          },
          {
            content: "1,99",
            boundingBox: [
              3.0424, 3.6023, 3.3509, 3.6023, 3.3509, 3.7362, 3.0424, 3.7362,
            ],
            confidence: 1,
            span: {
              offset: 253,
              length: 4,
            },
          },
          {
            content: "B",
            boundingBox: [
              3.4524, 3.603, 3.5206, 3.603, 3.5206, 3.7083, 3.4524, 3.7083,
            ],
            confidence: 1,
            span: {
              offset: 258,
              length: 1,
            },
          },
          {
            content: "1,99",
            boundingBox: [
              3.0424, 3.769, 3.3509, 3.769, 3.3509, 3.9028, 3.0424, 3.9028,
            ],
            confidence: 1,
            span: {
              offset: 260,
              length: 4,
            },
          },
          {
            content: "B",
            boundingBox: [
              3.4524, 3.7697, 3.5206, 3.7697, 3.5206, 3.875, 3.4524, 3.875,
            ],
            confidence: 1,
            span: {
              offset: 265,
              length: 1,
            },
          },
          {
            content: "1,49",
            boundingBox: [
              3.0424, 3.9357, 3.3509, 3.9357, 3.3509, 4.0695, 3.0424, 4.0695,
            ],
            confidence: 1,
            span: {
              offset: 267,
              length: 4,
            },
          },
          {
            content: "B",
            boundingBox: [
              3.4524, 3.9363, 3.5206, 3.9363, 3.5206, 4.0417, 3.4524, 4.0417,
            ],
            confidence: 1,
            span: {
              offset: 272,
              length: 1,
            },
          },
          {
            content: "1,13",
            boundingBox: [
              3.0424, 4.1023, 3.3489, 4.1023, 3.3489, 4.2362, 3.0424, 4.2362,
            ],
            confidence: 1,
            span: {
              offset: 274,
              length: 4,
            },
          },
          {
            content: "B",
            boundingBox: [
              3.4524, 4.103, 3.5206, 4.103, 3.5206, 4.2083, 3.4524, 4.2083,
            ],
            confidence: 1,
            span: {
              offset: 279,
              length: 1,
            },
          },
          {
            content: "1,99",
            boundingBox: [
              2.1258, 4.269, 2.4343, 4.269, 2.4343, 4.4028, 2.1258, 4.4028,
            ],
            confidence: 1,
            span: {
              offset: 281,
              length: 4,
            },
          },
          {
            content: "EUR/kg",
            boundingBox: [
              2.5376, 4.2625, 3.0236, 4.2625, 3.0236, 4.4035, 2.5376, 4.4035,
            ],
            confidence: 1,
            span: {
              offset: 286,
              length: 6,
            },
          },
          {
            content: "BIO",
            boundingBox: [
              0.2858, 4.4357, 0.5233, 4.4357, 0.5233, 4.5433, 0.2858, 4.5433,
            ],
            confidence: 1,
            span: {
              offset: 293,
              length: 3,
            },
          },
          {
            content: "EIER",
            boundingBox: [
              0.6209, 4.4362, 0.9384, 4.4362, 0.9384, 4.5417, 0.6209, 4.5417,
            ],
            confidence: 1,
            span: {
              offset: 297,
              length: 4,
            },
          },
          {
            content: "S-XL",
            boundingBox: [
              1.0364, 4.435, 1.3509, 4.435, 1.3509, 4.5432, 1.0364, 4.5432,
            ],
            confidence: 1,
            span: {
              offset: 302,
              length: 4,
            },
          },
          {
            content: "3,49",
            boundingBox: [
              3.0393, 4.4357, 3.3509, 4.4357, 3.3509, 4.5695, 3.0393, 4.5695,
            ],
            confidence: 1,
            span: {
              offset: 307,
              length: 4,
            },
          },
          {
            content: "B",
            boundingBox: [
              3.4524, 4.4363, 3.5206, 4.4363, 3.5206, 4.5417, 3.4524, 4.5417,
            ],
            confidence: 1,
            span: {
              offset: 312,
              length: 1,
            },
          },
          {
            content: "--------------------------------------",
            boundingBox: [
              0.3796, 4.6465, 3.5096, 4.6465, 3.5096, 4.6625, 0.3796, 4.6625,
            ],
            confidence: 1,
            span: {
              offset: 314,
              length: 38,
            },
          },
          {
            content: "SUMME",
            boundingBox: [
              0.3658, 4.767, 0.7714, 4.767, 0.7714, 4.8778, 0.3658, 4.8778,
            ],
            confidence: 1,
            span: {
              offset: 353,
              length: 5,
            },
          },
          {
            content: "EUR",
            boundingBox: [
              2.3704, 4.7697, 2.6093, 4.7697, 2.6093, 4.8772, 2.3704, 4.8772,
            ],
            confidence: 1,
            span: {
              offset: 359,
              length: 3,
            },
          },
          {
            content: "15,55",
            boundingBox: [
              3.0403, 4.7697, 3.4379, 4.7697, 3.4379, 4.903, 3.0403, 4.903,
            ],
            confidence: 1,
            span: {
              offset: 363,
              length: 5,
            },
          },
          {
            content: "======================================",
            boundingBox: [
              0.3679, 4.9617, 3.5218, 4.9617, 3.5218, 5.012, 0.3679, 5.012,
            ],
            confidence: 1,
            span: {
              offset: 369,
              length: 38,
            },
          },
          {
            content: "Geg.",
            boundingBox: [
              0.3638, 5.1003, 0.6623, 5.1003, 0.6623, 5.237, 0.3638, 5.237,
            ],
            confidence: 1,
            span: {
              offset: 408,
              length: 4,
            },
          },
          {
            content: "Mastercard",
            boundingBox: [
              0.7828, 5.0942, 1.6043, 5.0942, 1.6043, 5.2108, 0.7828, 5.2108,
            ],
            confidence: 1,
            span: {
              offset: 413,
              length: 10,
            },
          },
          {
            content: "EUR",
            boundingBox: [
              2.3704, 5.103, 2.6093, 5.103, 2.6093, 5.2105, 2.3704, 5.2105,
            ],
            confidence: 1,
            span: {
              offset: 424,
              length: 3,
            },
          },
          {
            content: "15,55",
            boundingBox: [
              3.0403, 5.103, 3.4379, 5.103, 3.4379, 5.2363, 3.0403, 5.2363,
            ],
            confidence: 1,
            span: {
              offset: 428,
              length: 5,
            },
          },
          {
            content: "*",
            boundingBox: [
              1.1179, 5.451, 1.1874, 5.451, 1.1874, 5.5212, 1.1179, 5.5212,
            ],
            confidence: 1,
            span: {
              offset: 434,
              length: 1,
            },
          },
          {
            content: "*",
            boundingBox: [
              1.2846, 5.451, 1.3541, 5.451, 1.3541, 5.5212, 1.2846, 5.5212,
            ],
            confidence: 1,
            span: {
              offset: 436,
              length: 1,
            },
          },
          {
            content: "Kundenbeleg",
            boundingBox: [
              1.5348, 5.4292, 2.4403, 5.4292, 2.4403, 5.5702, 1.5348, 5.5702,
            ],
            confidence: 1,
            span: {
              offset: 438,
              length: 11,
            },
          },
          {
            content: "*",
            boundingBox: [
              2.6179, 5.451, 2.6874, 5.451, 2.6874, 5.5212, 2.6179, 5.5212,
            ],
            confidence: 1,
            span: {
              offset: 450,
              length: 1,
            },
          },
          {
            content: "*",
            boundingBox: [
              2.7846, 5.451, 2.8541, 5.451, 2.8541, 5.5212, 2.7846, 5.5212,
            ],
            confidence: 1,
            span: {
              offset: 452,
              length: 1,
            },
          },
          {
            content: "Datum:",
            boundingBox: [
              0.2868, 5.603, 0.7441, 5.603, 0.7441, 5.71, 0.2868, 5.71,
            ],
            confidence: 1,
            span: {
              offset: 454,
              length: 6,
            },
          },
          {
            content: "21.05.2022",
            boundingBox: [
              2.7874, 5.6023, 3.6009, 5.6023, 3.6009, 5.71, 2.7874, 5.71,
            ],
            confidence: 1,
            span: {
              offset: 461,
              length: 10,
            },
          },
          {
            content: "Uhrzeit:",
            boundingBox: [
              0.2861, 5.7625, 0.9108, 5.7625, 0.9108, 5.8767, 0.2861, 5.8767,
            ],
            confidence: 1,
            span: {
              offset: 472,
              length: 8,
            },
          },
          {
            content: "11:35:17",
            boundingBox: [
              2.6258, 5.769, 3.2664, 5.769, 3.2664, 5.8767, 2.6258, 5.8767,
            ],
            confidence: 1,
            span: {
              offset: 481,
              length: 8,
            },
          },
          {
            content: "Uhr",
            boundingBox: [
              3.3694, 5.7625, 3.6041, 5.7625, 3.6041, 5.8767, 3.3694, 5.8767,
            ],
            confidence: 1,
            span: {
              offset: 490,
              length: 3,
            },
          },
          {
            content: "Beleg-Nr.",
            boundingBox: [
              0.2858, 5.9292, 0.9936, 5.9292, 0.9936, 6.0702, 0.2858, 6.0702,
            ],
            confidence: 1,
            span: {
              offset: 494,
              length: 9,
            },
          },
          {
            content: "7700",
            boundingBox: [
              3.2909, 5.9357, 3.6016, 5.9357, 3.6016, 6.0433, 3.2909, 6.0433,
            ],
            confidence: 1,
            span: {
              offset: 504,
              length: 4,
            },
          },
          {
            content: "Trace-Nr.",
            boundingBox: [
              0.2829, 6.1028, 0.9936, 6.1028, 0.9936, 6.21, 0.2829, 6.21,
            ],
            confidence: 1,
            span: {
              offset: 509,
              length: 9,
            },
          },
          {
            content: "224875",
            boundingBox: [
              3.1208, 6.1017, 3.6019, 6.1017, 3.6019, 6.21, 3.1208, 6.21,
            ],
            confidence: 1,
            span: {
              offset: 519,
              length: 6,
            },
          },
          {
            content: "Bezahlung",
            boundingBox: [
              1.6191, 6.2625, 2.3569, 6.2625, 2.3569, 6.4035, 1.6191, 6.4035,
            ],
            confidence: 1,
            span: {
              offset: 526,
              length: 9,
            },
          },
          {
            content: "Contactless",
            boundingBox: [
              1.5346, 6.4292, 2.4344, 6.4292, 2.4344, 6.5433, 1.5346, 6.5433,
            ],
            confidence: 1,
            span: {
              offset: 536,
              length: 11,
            },
          },
          {
            content: "DEBIT",
            boundingBox: [
              1.3701, 6.6028, 1.7716, 6.6028, 1.7716, 6.7085, 1.3701, 6.7085,
            ],
            confidence: 1,
            span: {
              offset: 548,
              length: 5,
            },
          },
          {
            content: "MASTERCARD",
            boundingBox: [
              1.8679, 6.6012, 2.6878, 6.6012, 2.6878, 6.7098, 1.8679, 6.7098,
            ],
            confidence: 1,
            span: {
              offset: 554,
              length: 10,
            },
          },
          {
            content: "Nr.",
            boundingBox: [
              0.2861, 6.7697, 0.4936, 6.7697, 0.4936, 6.8767, 0.2861, 6.8767,
            ],
            confidence: 1,
            span: {
              offset: 565,
              length: 3,
            },
          },
          {
            content: "############8719",
            boundingBox: [
              1.8653, 6.7683, 3.1843, 6.7683, 3.1843, 6.8765, 1.8653, 6.8765,
            ],
            confidence: 1,
            span: {
              offset: 569,
              length: 16,
            },
          },
          {
            content: "0000",
            boundingBox: [
              3.2873, 6.769, 3.6016, 6.769, 3.6016, 6.8767, 3.2873, 6.8767,
            ],
            confidence: 1,
            span: {
              offset: 586,
              length: 4,
            },
          },
          {
            content: "gültig",
            boundingBox: [
              0.2841, 6.9292, 0.7736, 6.9292, 0.7736, 7.0702, 0.2841, 7.0702,
            ],
            confidence: 1,
            span: {
              offset: 591,
              length: 6,
            },
          },
          {
            content: "bis",
            boundingBox: [
              0.8711, 6.9292, 1.1011, 6.9292, 1.1011, 7.0433, 0.8711, 7.0433,
            ],
            confidence: 1,
            span: {
              offset: 598,
              length: 3,
            },
          },
          {
            content: "01/24",
            boundingBox: [
              3.2039, 6.9292, 3.6064, 6.9292, 3.6064, 7.0485, 3.2039, 7.0485,
            ],
            confidence: 1,
            span: {
              offset: 602,
              length: 5,
            },
          },
          {
            content: "VU-Nr.",
            boundingBox: [
              0.2819, 7.1028, 0.7436, 7.1028, 0.7436, 7.21, 0.2819, 7.21,
            ],
            confidence: 1,
            span: {
              offset: 608,
              length: 6,
            },
          },
          {
            content: "4556465581",
            boundingBox: [
              2.7858, 7.1017, 3.5778, 7.1017, 3.5778, 7.21, 2.7858, 7.21,
            ],
            confidence: 1,
            span: {
              offset: 615,
              length: 10,
            },
          },
          {
            content: "Terminal-ID",
            boundingBox: [
              0.2829, 7.2625, 1.1878, 7.2625, 1.1878, 7.3767, 0.2829, 7.3767,
            ],
            confidence: 1,
            span: {
              offset: 626,
              length: 11,
            },
          },
          {
            content: "56038840",
            boundingBox: [
              2.9551, 7.2683, 3.6016, 7.2683, 3.6016, 7.3767, 2.9551, 7.3767,
            ],
            confidence: 1,
            span: {
              offset: 638,
              length: 8,
            },
          },
          {
            content: "Pos-Info",
            boundingBox: [
              0.2876, 7.4282, 0.9379, 7.4282, 0.9379, 7.5432, 0.2876, 7.5432,
            ],
            confidence: 1,
            span: {
              offset: 647,
              length: 8,
            },
          },
          {
            content: "00",
            boundingBox: [
              2.8706, 7.4357, 3.0183, 7.4357, 3.0183, 7.5433, 2.8706, 7.5433,
            ],
            confidence: 1,
            span: {
              offset: 656,
              length: 2,
            },
          },
          {
            content: "075",
            boundingBox: [
              3.1206, 7.4357, 3.3519, 7.4357, 3.3519, 7.5433, 3.1206, 7.5433,
            ],
            confidence: 1,
            span: {
              offset: 659,
              length: 3,
            },
          },
          {
            content: "00",
            boundingBox: [
              3.4539, 7.4357, 3.6016, 7.4357, 3.6016, 7.5433, 3.4539, 7.5433,
            ],
            confidence: 1,
            span: {
              offset: 663,
              length: 2,
            },
          },
          {
            content: "AS-Zeit",
            boundingBox: [
              0.2804, 7.5973, 0.8518, 7.5973, 0.8518, 7.7098, 0.2804, 7.7098,
            ],
            confidence: 1,
            span: {
              offset: 666,
              length: 7,
            },
          },
          {
            content: "21.05.",
            boundingBox: [
              0.9541, 7.6023, 1.4103, 7.6023, 1.4103, 7.71, 0.9541, 7.71,
            ],
            confidence: 1,
            span: {
              offset: 674,
              length: 6,
            },
          },
          {
            content: "11:35",
            boundingBox: [
              2.8758, 7.6023, 3.2686, 7.6023, 3.2686, 7.71, 2.8758, 7.71,
            ],
            confidence: 1,
            span: {
              offset: 681,
              length: 5,
            },
          },
          {
            content: "Uhr",
            boundingBox: [
              3.3694, 7.5958, 3.6041, 7.5958, 3.6041, 7.71, 3.3694, 7.71,
            ],
            confidence: 1,
            span: {
              offset: 687,
              length: 3,
            },
          },
          {
            content: "AS-Proc-Code",
            boundingBox: [
              0.9471, 7.7625, 1.9353, 7.7625, 1.9353, 7.8767, 0.9471, 7.8767,
            ],
            confidence: 1,
            span: {
              offset: 691,
              length: 12,
            },
          },
          {
            content: "=",
            boundingBox: [
              2.0353, 7.7988, 2.1038, 7.7988, 2.1038, 7.8447, 2.0353, 7.8447,
            ],
            confidence: 1,
            span: {
              offset: 704,
              length: 1,
            },
          },
          {
            content: "00",
            boundingBox: [
              2.2039, 7.769, 2.3516, 7.769, 2.3516, 7.8767, 2.2039, 7.8767,
            ],
            confidence: 1,
            span: {
              offset: 706,
              length: 2,
            },
          },
          {
            content: "075",
            boundingBox: [
              2.4539, 7.769, 2.6853, 7.769, 2.6853, 7.8767, 2.4539, 7.8767,
            ],
            confidence: 1,
            span: {
              offset: 709,
              length: 3,
            },
          },
          {
            content: "00",
            boundingBox: [
              2.7873, 7.769, 2.9349, 7.769, 2.9349, 7.8767, 2.7873, 7.8767,
            ],
            confidence: 1,
            span: {
              offset: 713,
              length: 2,
            },
          },
          {
            content: "Capt.-Ref.=",
            boundingBox: [
              1.2846, 7.9282, 2.1871, 7.9282, 2.1871, 8.0693, 1.2846, 8.0693,
            ],
            confidence: 1,
            span: {
              offset: 716,
              length: 11,
            },
          },
          {
            content: "0000",
            boundingBox: [
              2.2873, 7.9357, 2.6016, 7.9357, 2.6016, 8.0433, 2.2873, 8.0433,
            ],
            confidence: 1,
            span: {
              offset: 728,
              length: 4,
            },
          },
          {
            content: "APPROVED",
            boundingBox: [
              1.6138, 8.1012, 2.2711, 8.1012, 2.2711, 8.21, 1.6138, 8.21,
            ],
            confidence: 1,
            span: {
              offset: 733,
              length: 8,
            },
          },
          {
            content: "Betrag",
            boundingBox: [
              0.2858, 8.2697, 0.7736, 8.2697, 0.7736, 8.4035, 0.2858, 8.4035,
            ],
            confidence: 1,
            span: {
              offset: 742,
              length: 6,
            },
          },
          {
            content: "EUR",
            boundingBox: [
              0.8709, 8.2695, 1.1051, 8.2695, 1.1051, 8.3767, 0.8709, 8.3767,
            ],
            confidence: 1,
            span: {
              offset: 749,
              length: 3,
            },
          },
          {
            content: "15,55",
            boundingBox: [
              3.2091, 8.2695, 3.6019, 8.2695, 3.6019, 8.4028, 3.2091, 8.4028,
            ],
            confidence: 1,
            span: {
              offset: 753,
              length: 5,
            },
          },
          {
            content: "Zahlung",
            boundingBox: [
              1.3694, 8.4292, 1.9403, 8.4292, 1.9403, 8.5702, 1.3694, 8.5702,
            ],
            confidence: 1,
            span: {
              offset: 759,
              length: 7,
            },
          },
          {
            content: "erfolgt",
            boundingBox: [
              2.0359, 8.4282, 2.6018, 8.4282, 2.6018, 8.5702, 2.0359, 8.5702,
            ],
            confidence: 1,
            span: {
              offset: 767,
              length: 7,
            },
          },
          {
            content: "Steuer",
            boundingBox: [
              0.3468, 8.7533, 0.71, 8.7533, 0.71, 8.8346, 0.3468, 8.8346,
            ],
            confidence: 1,
            span: {
              offset: 775,
              length: 6,
            },
          },
          {
            content: "%",
            boundingBox: [
              0.8438, 8.753, 0.9005, 8.753, 0.9005, 8.8345, 0.8438, 8.8345,
            ],
            confidence: 1,
            span: {
              offset: 782,
              length: 1,
            },
          },
          {
            content: "B=",
            boundingBox: [
              0.3463, 8.8793, 0.4598, 8.8793, 0.4598, 8.9583, 0.3463, 8.9583,
            ],
            confidence: 1,
            span: {
              offset: 784,
              length: 2,
            },
          },
          {
            content: "7,0%",
            boundingBox: [
              0.6627, 8.878, 0.9005, 8.878, 0.9005, 8.9792, 0.6627, 8.9792,
            ],
            confidence: 1,
            span: {
              offset: 787,
              length: 4,
            },
          },
          {
            content: "Gesamtbetrag",
            boundingBox: [
              0.3447, 8.999, 1.0872, 8.999, 1.0872, 9.1047, 0.3447, 9.1047,
            ],
            confidence: 1,
            span: {
              offset: 792,
              length: 12,
            },
          },
          {
            content: "Netto",
            boundingBox: [
              1.534, 8.7543, 1.8354, 8.7543, 1.8354, 8.8345, 1.534, 8.8345,
            ],
            confidence: 1,
            span: {
              offset: 805,
              length: 5,
            },
          },
          {
            content: "14,53",
            boundingBox: [
              1.5388, 8.8788, 1.8312, 8.8788, 1.8312, 8.9792, 1.5388, 8.9792,
            ],
            confidence: 1,
            span: {
              offset: 811,
              length: 5,
            },
          },
          {
            content: "14,53",
            boundingBox: [
              1.5388, 9.0038, 1.8312, 9.0038, 1.8312, 9.1042, 1.5388, 9.1042,
            ],
            confidence: 1,
            span: {
              offset: 817,
              length: 5,
            },
          },
          {
            content: "Steuer",
            boundingBox: [
              2.3468, 8.7533, 2.71, 8.7533, 2.71, 8.8346, 2.3468, 8.8346,
            ],
            confidence: 1,
            span: {
              offset: 823,
              length: 6,
            },
          },
          {
            content: "1,02",
            boundingBox: [
              2.4763, 8.8788, 2.7077, 8.8788, 2.7077, 8.9792, 2.4763, 8.9792,
            ],
            confidence: 1,
            span: {
              offset: 830,
              length: 4,
            },
          },
          {
            content: "1,02",
            boundingBox: [
              2.4763, 9.0038, 2.7077, 9.0038, 2.7077, 9.1042, 2.4763, 9.1042,
            ],
            confidence: 1,
            span: {
              offset: 835,
              length: 4,
            },
          },
          {
            content: "Brutto",
            boundingBox: [
              3.2213, 8.7543, 3.5854, 8.7543, 3.5854, 8.8346, 3.2213, 8.8346,
            ],
            confidence: 1,
            span: {
              offset: 840,
              length: 6,
            },
          },
          {
            content: "15,55",
            boundingBox: [
              3.2888, 8.8792, 3.5834, 8.8792, 3.5834, 8.9792, 3.2888, 8.9792,
            ],
            confidence: 1,
            span: {
              offset: 847,
              length: 5,
            },
          },
          {
            content: "15,55",
            boundingBox: [
              3.2888, 9.0042, 3.5834, 9.0042, 3.5834, 9.1042, 3.2888, 9.1042,
            ],
            confidence: 1,
            span: {
              offset: 853,
              length: 5,
            },
          },
          {
            content: "TSE-Signatur:",
            boundingBox: [
              0.2817, 9.2918, 1.065, 9.2918, 1.065, 9.3964, 0.2817, 9.3964,
            ],
            confidence: 1,
            span: {
              offset: 859,
              length: 13,
            },
          },
          {
            content: "CURezCxAege6BbDXvtcNRO13FbL6/E1zX",
            boundingBox: [
              1.5954, 9.2906, 3.6488, 9.2906, 3.6488, 9.3964, 1.5954, 9.3964,
            ],
            confidence: 1,
            span: {
              offset: 873,
              length: 33,
            },
          },
          {
            content: "oyeC0BM7Kbgfnrbyh258bYpNQmRz40YcG",
            boundingBox: [
              1.5952, 9.4149, 3.6478, 9.4149, 3.6478, 9.5216, 1.5952, 9.5216,
            ],
            confidence: 1,
            span: {
              offset: 907,
              length: 33,
            },
          },
          {
            content: "xI+S19z9Fh5uyWGpt5azfzUQC9BnF9hAV",
            boundingBox: [
              1.5962, 9.5399, 3.65, 9.5399, 3.65, 9.6466, 1.5962, 9.6466,
            ],
            confidence: 1,
            span: {
              offset: 941,
              length: 33,
            },
          },
          {
            content: "6/gURcO7KOf63OzUPFx1KBcZVCb4i",
            boundingBox: [
              1.5987, 9.6649, 3.3898, 9.6649, 3.3898, 9.7714, 1.5987, 9.7714,
            ],
            confidence: 1,
            span: {
              offset: 975,
              length: 29,
            },
          },
          {
            content: "TSE-Signaturzähler:",
            boundingBox: [
              0.7817, 9.7906, 1.94, 9.7906, 1.94, 9.8964, 0.7817, 9.8964,
            ],
            confidence: 1,
            span: {
              offset: 1005,
              length: 19,
            },
          },
          {
            content: "341392",
            boundingBox: [
              2.0989, 9.7955, 2.4577, 9.7955, 2.4577, 9.8762, 2.0989, 9.8762,
            ],
            confidence: 1,
            span: {
              offset: 1025,
              length: 6,
            },
          },
          {
            content: "TSE-Transaktion:",
            boundingBox: [
              0.7817, 9.9156, 1.7525, 9.9156, 1.7525, 10.0012, 0.7817, 10.0012,
            ],
            confidence: 1,
            span: {
              offset: 1032,
              length: 16,
            },
          },
          {
            content: "163235",
            boundingBox: [
              2.1013, 9.9201, 2.4584, 9.9201, 2.4584, 10.0012, 2.1013, 10.0012,
            ],
            confidence: 1,
            span: {
              offset: 1049,
              length: 6,
            },
          },
          {
            content: "TSE-Start:",
            boundingBox: [
              0.5317, 10.045, 1.1275, 10.045, 1.1275, 10.1262, 0.5317, 10.1262,
            ],
            confidence: 1,
            span: {
              offset: 1056,
              length: 10,
            },
          },
          {
            content: "2022-05-21T11:35:03.000",
            boundingBox: [
              1.8475, 10.0455, 3.2707, 10.0455, 3.2707, 10.1262, 1.8475,
              10.1262,
            ],
            confidence: 1,
            span: {
              offset: 1067,
              length: 23,
            },
          },
          {
            content: "TSE-Stop:",
            boundingBox: [
              0.5317, 10.17, 1.065, 10.17, 1.065, 10.2708, 0.5317, 10.2708,
            ],
            confidence: 1,
            span: {
              offset: 1091,
              length: 9,
            },
          },
          {
            content: "2022-05-21T11:35:38.000",
            boundingBox: [
              1.8475, 10.17, 3.2707, 10.17, 3.2707, 10.2512, 1.8475, 10.2512,
            ],
            confidence: 1,
            span: {
              offset: 1101,
              length: 23,
            },
          },
          {
            content: "Seriennnummer",
            boundingBox: [
              0.5343, 10.2918, 1.335, 10.2918, 1.335, 10.3762, 0.5343, 10.3762,
            ],
            confidence: 1,
            span: {
              offset: 1125,
              length: 13,
            },
          },
          {
            content: "Kasse:",
            boundingBox: [
              1.408, 10.2954, 1.7525, 10.2954, 1.7525, 10.3762, 1.408, 10.3762,
            ],
            confidence: 1,
            span: {
              offset: 1139,
              length: 6,
            },
          },
          {
            content: "REWE:e0:d5:5e:c6:d3:3a:00",
            boundingBox: [
              1.8473, 10.2906, 3.3957, 10.2906, 3.3957, 10.3762, 1.8473,
              10.3762,
            ],
            confidence: 1,
            span: {
              offset: 1146,
              length: 25,
            },
          },
          {
            content: "21.05.2022",
            boundingBox: [
              0.4541, 10.4357, 1.2676, 10.4357, 1.2676, 10.5433, 0.4541,
              10.5433,
            ],
            confidence: 1,
            span: {
              offset: 1172,
              length: 10,
            },
          },
          {
            content: "11:35",
            boundingBox: [
              1.7091, 10.4357, 2.1019, 10.4357, 2.1019, 10.5433, 1.7091,
              10.5433,
            ],
            confidence: 1,
            span: {
              offset: 1183,
              length: 5,
            },
          },
          {
            content: "Bon-Nr.:5580",
            boundingBox: [
              2.5358, 10.435, 3.5183, 10.435, 3.5183, 10.5433, 2.5358, 10.5433,
            ],
            confidence: 1,
            span: {
              offset: 1189,
              length: 12,
            },
          },
          {
            content: "Markt:6008",
            boundingBox: [
              0.4513, 10.5958, 1.2679, 10.5958, 1.2679, 10.71, 0.4513, 10.71,
            ],
            confidence: 1,
            span: {
              offset: 1202,
              length: 10,
            },
          },
          {
            content: "Kasse:1",
            boundingBox: [
              1.7014, 10.6022, 2.2444, 10.6022, 2.2444, 10.71, 1.7014, 10.71,
            ],
            confidence: 1,
            span: {
              offset: 1213,
              length: 7,
            },
          },
          {
            content: "Bed.:404040",
            boundingBox: [
              2.5358, 10.5958, 3.4349, 10.5958, 3.4349, 10.71, 2.5358, 10.71,
            ],
            confidence: 1,
            span: {
              offset: 1221,
              length: 11,
            },
          },
          {
            content: "****************************************",
            boundingBox: [
              0.3679, 10.7843, 3.6874, 10.7843, 3.6874, 10.8545, 0.3679,
              10.8545,
            ],
            confidence: 1,
            span: {
              offset: 1233,
              length: 40,
            },
          },
          {
            content: "Ihre",
            boundingBox: [
              0.7899, 11.0942, 1.1039, 11.0942, 1.1039, 11.2108, 0.7899,
              11.2108,
            ],
            confidence: 1,
            span: {
              offset: 1274,
              length: 4,
            },
          },
          {
            content: "REWE",
            boundingBox: [
              1.2023, 11.103, 1.5214, 11.103, 1.5214, 11.2083, 1.2023, 11.2083,
            ],
            confidence: 1,
            span: {
              offset: 1279,
              length: 4,
            },
          },
          {
            content: "PAYBACK",
            boundingBox: [
              1.6194, 11.1003, 2.1954, 11.1003, 2.1954, 11.2112, 1.6194,
              11.2112,
            ],
            confidence: 1,
            span: {
              offset: 1284,
              length: 7,
            },
          },
          {
            content: "Vorteile",
            boundingBox: [
              2.2794, 11.0933, 2.9373, 11.0933, 2.9373, 11.2108, 2.2794,
              11.2108,
            ],
            confidence: 1,
            span: {
              offset: 1292,
              length: 8,
            },
          },
          {
            content: "heute",
            boundingBox: [
              3.0378, 11.0942, 3.4373, 11.0942, 3.4373, 11.2115, 3.0378,
              11.2115,
            ],
            confidence: 1,
            span: {
              offset: 1301,
              length: 5,
            },
          },
          {
            content: "PAYBACK",
            boundingBox: [
              0.7043, 11.2678, 1.2729, 11.2678, 1.2729, 11.3765, 0.7043,
              11.3765,
            ],
            confidence: 1,
            span: {
              offset: 1307,
              length: 7,
            },
          },
          {
            content: "Karten-Nr.:",
            boundingBox: [
              1.3681, 11.2688, 2.2441, 11.2688, 2.2441, 11.3767, 1.3681,
              11.3767,
            ],
            confidence: 1,
            span: {
              offset: 1315,
              length: 11,
            },
          },
          {
            content: "#########0111",
            boundingBox: [
              2.3653, 11.269, 3.4111, 11.269, 3.4111, 11.3767, 2.3653, 11.3767,
            ],
            confidence: 1,
            span: {
              offset: 1327,
              length: 13,
            },
          },
        ],
        lines: [
          {
            content: "REWE",
            boundingBox: [
              0.2384, 0.5729, 3.6871, 0.5982, 3.682, 1.6426, 0.2282, 1.597,
            ],
            spans: [
              {
                offset: 0,
                length: 4,
              },
            ],
          },
          {
            content: "GEBA Supermärkte GmbH & Co. KG",
            boundingBox: [
              0.6169, 2.0958, 3.1044, 2.0958, 3.1044, 2.236, 0.6169, 2.236,
            ],
            spans: [
              {
                offset: 5,
                length: 30,
              },
            ],
          },
          {
            content: "Bautzener Str.",
            boundingBox: [
              1.1191, 2.2683, 2.2436, 2.2683, 2.2436, 2.3767, 1.1191, 2.3767,
            ],
            spans: [
              {
                offset: 36,
                length: 14,
              },
            ],
          },
          {
            content: "36",
            boundingBox: [
              2.3726, 2.2685, 2.5176, 2.2685, 2.5176, 2.3767, 2.3726, 2.3767,
            ],
            spans: [
              {
                offset: 51,
                length: 2,
              },
            ],
          },
          {
            content: "10829 Berlin",
            boundingBox: [
              1.3758, 2.4292, 2.3496, 2.4292, 2.3496, 2.5433, 1.3758, 2.5433,
            ],
            spans: [
              {
                offset: 54,
                length: 12,
              },
            ],
          },
          {
            content: "UID Nr.:",
            boundingBox: [
              1.0361, 2.603, 1.6608, 2.603, 1.6608, 2.71, 1.0361, 2.71,
            ],
            spans: [
              {
                offset: 67,
                length: 8,
              },
            ],
          },
          {
            content: "DE242311334",
            boundingBox: [
              1.7868, 2.6023, 2.6898, 2.6023, 2.6898, 2.71, 1.7868, 2.71,
            ],
            spans: [
              {
                offset: 76,
                length: 11,
              },
            ],
          },
          {
            content: "FRANZ.WEICHKAESE",
            boundingBox: [
              0.2908, 2.9345, 1.6013, 2.9345, 1.6013, 3.0433, 0.2908, 3.0433,
            ],
            spans: [
              {
                offset: 88,
                length: 16,
              },
            ],
          },
          {
            content: "FRISCH.DOPPELRA.",
            boundingBox: [
              0.2908, 3.1012, 1.5769, 3.1012, 1.5769, 3.21, 0.2908, 3.21,
            ],
            spans: [
              {
                offset: 105,
                length: 16,
              },
            ],
          },
          {
            content: "BAGELS SESAM",
            boundingBox: [
              0.2858, 3.2678, 1.2711, 3.2678, 1.2711, 3.3765, 0.2858, 3.3765,
            ],
            spans: [
              {
                offset: 122,
                length: 12,
              },
            ],
          },
          {
            content: "ROGGENBROETCHEN",
            boundingBox: [
              0.2871, 3.4352, 1.5204, 3.4352, 1.5204, 3.5433, 0.2871, 3.5433,
            ],
            spans: [
              {
                offset: 135,
                length: 15,
              },
            ],
          },
          {
            content: "TRAUBE KERNL.HEL",
            boundingBox: [
              0.2829, 3.6012, 1.6009, 3.6012, 1.6009, 3.71, 0.2829, 3.71,
            ],
            spans: [
              {
                offset: 151,
                length: 16,
              },
            ],
          },
          {
            content: "SOFT DATTELN",
            boundingBox: [
              0.2864, 3.7678, 1.2704, 3.7678, 1.2704, 3.8767, 0.2864, 3.8767,
            ],
            spans: [
              {
                offset: 168,
                length: 12,
              },
            ],
          },
          {
            content: "AVOCADO VORGER.",
            boundingBox: [
              0.2804, 3.9345, 1.4936, 3.9345, 1.4936, 4.0433, 0.2804, 4.0433,
            ],
            spans: [
              {
                offset: 181,
                length: 15,
              },
            ],
          },
          {
            content: "RISPENTOMATE",
            boundingBox: [
              0.2871, 4.1012, 1.2679, 4.1012, 1.2679, 4.21, 0.2871, 4.21,
            ],
            spans: [
              {
                offset: 197,
                length: 12,
              },
            ],
          },
          {
            content: "0,568 kg x",
            boundingBox: [
              1.0373, 4.2625, 1.8538, 4.2625, 1.8538, 4.4035, 1.0373, 4.4035,
            ],
            spans: [
              {
                offset: 210,
                length: 10,
              },
            ],
          },
          {
            content: "EUR",
            boundingBox: [
              3.2043, 2.7695, 3.4384, 2.7695, 3.4384, 2.8767, 3.2043, 2.8767,
            ],
            spans: [
              {
                offset: 221,
                length: 3,
              },
            ],
          },
          {
            content: "1,39 B",
            boundingBox: [
              3.0424, 2.9357, 3.5206, 2.9357, 3.5206, 3.0695, 3.0424, 3.0695,
            ],
            spans: [
              {
                offset: 225,
                length: 6,
              },
            ],
          },
          {
            content: "1,19 B",
            boundingBox: [
              3.0424, 3.1023, 3.5206, 3.1023, 3.5206, 3.2362, 3.0424, 3.2362,
            ],
            spans: [
              {
                offset: 232,
                length: 6,
              },
            ],
          },
          {
            content: "1,49 B",
            boundingBox: [
              3.0424, 3.269, 3.5206, 3.269, 3.5206, 3.4028, 3.0424, 3.4028,
            ],
            spans: [
              {
                offset: 239,
                length: 6,
              },
            ],
          },
          {
            content: "1,39 B",
            boundingBox: [
              3.0424, 3.4357, 3.5206, 3.4357, 3.5206, 3.5695, 3.0424, 3.5695,
            ],
            spans: [
              {
                offset: 246,
                length: 6,
              },
            ],
          },
          {
            content: "1,99 B",
            boundingBox: [
              3.0424, 3.6023, 3.5206, 3.6023, 3.5206, 3.7362, 3.0424, 3.7362,
            ],
            spans: [
              {
                offset: 253,
                length: 6,
              },
            ],
          },
          {
            content: "1,99 B",
            boundingBox: [
              3.0424, 3.769, 3.5206, 3.769, 3.5206, 3.9028, 3.0424, 3.9028,
            ],
            spans: [
              {
                offset: 260,
                length: 6,
              },
            ],
          },
          {
            content: "1,49 B",
            boundingBox: [
              3.0424, 3.9357, 3.5206, 3.9357, 3.5206, 4.0695, 3.0424, 4.0695,
            ],
            spans: [
              {
                offset: 267,
                length: 6,
              },
            ],
          },
          {
            content: "1,13 B",
            boundingBox: [
              3.0424, 4.1023, 3.5206, 4.1023, 3.5206, 4.2362, 3.0424, 4.2362,
            ],
            spans: [
              {
                offset: 274,
                length: 6,
              },
            ],
          },
          {
            content: "1,99 EUR/kg",
            boundingBox: [
              2.1258, 4.2625, 3.0236, 4.2625, 3.0236, 4.4035, 2.1258, 4.4035,
            ],
            spans: [
              {
                offset: 281,
                length: 11,
              },
            ],
          },
          {
            content: "BIO EIER S-XL",
            boundingBox: [
              0.2858, 4.435, 1.3509, 4.435, 1.3509, 4.5433, 0.2858, 4.5433,
            ],
            spans: [
              {
                offset: 293,
                length: 13,
              },
            ],
          },
          {
            content: "3,49 B",
            boundingBox: [
              3.0393, 4.4357, 3.5206, 4.4357, 3.5206, 4.5695, 3.0393, 4.5695,
            ],
            spans: [
              {
                offset: 307,
                length: 6,
              },
            ],
          },
          {
            content: "--------------------------------------",
            boundingBox: [
              0.3796, 4.6465, 3.5096, 4.6465, 3.5096, 4.6625, 0.3796, 4.6625,
            ],
            spans: [
              {
                offset: 314,
                length: 38,
              },
            ],
          },
          {
            content: "SUMME",
            boundingBox: [
              0.3658, 4.767, 0.7714, 4.767, 0.7714, 4.8778, 0.3658, 4.8778,
            ],
            spans: [
              {
                offset: 353,
                length: 5,
              },
            ],
          },
          {
            content: "EUR",
            boundingBox: [
              2.3704, 4.7697, 2.6093, 4.7697, 2.6093, 4.8772, 2.3704, 4.8772,
            ],
            spans: [
              {
                offset: 359,
                length: 3,
              },
            ],
          },
          {
            content: "15,55",
            boundingBox: [
              3.0403, 4.7697, 3.4379, 4.7697, 3.4379, 4.903, 3.0403, 4.903,
            ],
            spans: [
              {
                offset: 363,
                length: 5,
              },
            ],
          },
          {
            content: "======================================",
            boundingBox: [
              0.3679, 4.9617, 3.5218, 4.9617, 3.5218, 5.012, 0.3679, 5.012,
            ],
            spans: [
              {
                offset: 369,
                length: 38,
              },
            ],
          },
          {
            content: "Geg. Mastercard",
            boundingBox: [
              0.3638, 5.0942, 1.6043, 5.0942, 1.6043, 5.237, 0.3638, 5.237,
            ],
            spans: [
              {
                offset: 408,
                length: 15,
              },
            ],
          },
          {
            content: "EUR",
            boundingBox: [
              2.3704, 5.103, 2.6093, 5.103, 2.6093, 5.2105, 2.3704, 5.2105,
            ],
            spans: [
              {
                offset: 424,
                length: 3,
              },
            ],
          },
          {
            content: "15,55",
            boundingBox: [
              3.0403, 5.103, 3.4379, 5.103, 3.4379, 5.2363, 3.0403, 5.2363,
            ],
            spans: [
              {
                offset: 428,
                length: 5,
              },
            ],
          },
          {
            content: "*",
            boundingBox: [
              1.1179, 5.451, 1.1874, 5.451, 1.1874, 5.5212, 1.1179, 5.5212,
            ],
            spans: [
              {
                offset: 434,
                length: 1,
              },
            ],
          },
          {
            content: "*",
            boundingBox: [
              1.2846, 5.451, 1.3541, 5.451, 1.3541, 5.5212, 1.2846, 5.5212,
            ],
            spans: [
              {
                offset: 436,
                length: 1,
              },
            ],
          },
          {
            content: "Kundenbeleg",
            boundingBox: [
              1.5348, 5.4292, 2.4403, 5.4292, 2.4403, 5.5702, 1.5348, 5.5702,
            ],
            spans: [
              {
                offset: 438,
                length: 11,
              },
            ],
          },
          {
            content: "*",
            boundingBox: [
              2.6179, 5.451, 2.6874, 5.451, 2.6874, 5.5212, 2.6179, 5.5212,
            ],
            spans: [
              {
                offset: 450,
                length: 1,
              },
            ],
          },
          {
            content: "*",
            boundingBox: [
              2.7846, 5.451, 2.8541, 5.451, 2.8541, 5.5212, 2.7846, 5.5212,
            ],
            spans: [
              {
                offset: 452,
                length: 1,
              },
            ],
          },
          {
            content: "Datum:",
            boundingBox: [
              0.2868, 5.603, 0.7441, 5.603, 0.7441, 5.71, 0.2868, 5.71,
            ],
            spans: [
              {
                offset: 454,
                length: 6,
              },
            ],
          },
          {
            content: "21.05.2022",
            boundingBox: [
              2.7874, 5.6023, 3.6009, 5.6023, 3.6009, 5.71, 2.7874, 5.71,
            ],
            spans: [
              {
                offset: 461,
                length: 10,
              },
            ],
          },
          {
            content: "Uhrzeit:",
            boundingBox: [
              0.2861, 5.7625, 0.9108, 5.7625, 0.9108, 5.8767, 0.2861, 5.8767,
            ],
            spans: [
              {
                offset: 472,
                length: 8,
              },
            ],
          },
          {
            content: "11:35:17 Uhr",
            boundingBox: [
              2.6258, 5.7625, 3.6041, 5.7625, 3.6041, 5.8767, 2.6258, 5.8767,
            ],
            spans: [
              {
                offset: 481,
                length: 12,
              },
            ],
          },
          {
            content: "Beleg-Nr.",
            boundingBox: [
              0.2858, 5.9292, 0.9936, 5.9292, 0.9936, 6.0702, 0.2858, 6.0702,
            ],
            spans: [
              {
                offset: 494,
                length: 9,
              },
            ],
          },
          {
            content: "7700",
            boundingBox: [
              3.2909, 5.9357, 3.6016, 5.9357, 3.6016, 6.0433, 3.2909, 6.0433,
            ],
            spans: [
              {
                offset: 504,
                length: 4,
              },
            ],
          },
          {
            content: "Trace-Nr.",
            boundingBox: [
              0.2829, 6.1028, 0.9936, 6.1028, 0.9936, 6.21, 0.2829, 6.21,
            ],
            spans: [
              {
                offset: 509,
                length: 9,
              },
            ],
          },
          {
            content: "224875",
            boundingBox: [
              3.1208, 6.1017, 3.6019, 6.1017, 3.6019, 6.21, 3.1208, 6.21,
            ],
            spans: [
              {
                offset: 519,
                length: 6,
              },
            ],
          },
          {
            content: "Bezahlung",
            boundingBox: [
              1.6191, 6.2625, 2.3569, 6.2625, 2.3569, 6.4035, 1.6191, 6.4035,
            ],
            spans: [
              {
                offset: 526,
                length: 9,
              },
            ],
          },
          {
            content: "Contactless",
            boundingBox: [
              1.5346, 6.4292, 2.4344, 6.4292, 2.4344, 6.5433, 1.5346, 6.5433,
            ],
            spans: [
              {
                offset: 536,
                length: 11,
              },
            ],
          },
          {
            content: "DEBIT MASTERCARD",
            boundingBox: [
              1.3701, 6.6012, 2.6878, 6.6012, 2.6878, 6.7098, 1.3701, 6.7098,
            ],
            spans: [
              {
                offset: 548,
                length: 16,
              },
            ],
          },
          {
            content: "Nr.",
            boundingBox: [
              0.2861, 6.7697, 0.4936, 6.7697, 0.4936, 6.8767, 0.2861, 6.8767,
            ],
            spans: [
              {
                offset: 565,
                length: 3,
              },
            ],
          },
          {
            content: "############8719 0000",
            boundingBox: [
              1.8653, 6.7683, 3.6016, 6.7683, 3.6016, 6.8767, 1.8653, 6.8767,
            ],
            spans: [
              {
                offset: 569,
                length: 21,
              },
            ],
          },
          {
            content: "gültig bis",
            boundingBox: [
              0.2841, 6.9292, 1.1011, 6.9292, 1.1011, 7.0702, 0.2841, 7.0702,
            ],
            spans: [
              {
                offset: 591,
                length: 10,
              },
            ],
          },
          {
            content: "01/24",
            boundingBox: [
              3.2039, 6.9292, 3.6064, 6.9292, 3.6064, 7.0485, 3.2039, 7.0485,
            ],
            spans: [
              {
                offset: 602,
                length: 5,
              },
            ],
          },
          {
            content: "VU-Nr.",
            boundingBox: [
              0.2819, 7.1028, 0.7436, 7.1028, 0.7436, 7.21, 0.2819, 7.21,
            ],
            spans: [
              {
                offset: 608,
                length: 6,
              },
            ],
          },
          {
            content: "4556465581",
            boundingBox: [
              2.7858, 7.1017, 3.5778, 7.1017, 3.5778, 7.21, 2.7858, 7.21,
            ],
            spans: [
              {
                offset: 615,
                length: 10,
              },
            ],
          },
          {
            content: "Terminal-ID",
            boundingBox: [
              0.2829, 7.2625, 1.1878, 7.2625, 1.1878, 7.3767, 0.2829, 7.3767,
            ],
            spans: [
              {
                offset: 626,
                length: 11,
              },
            ],
          },
          {
            content: "56038840",
            boundingBox: [
              2.9551, 7.2683, 3.6016, 7.2683, 3.6016, 7.3767, 2.9551, 7.3767,
            ],
            spans: [
              {
                offset: 638,
                length: 8,
              },
            ],
          },
          {
            content: "Pos-Info",
            boundingBox: [
              0.2876, 7.4282, 0.9379, 7.4282, 0.9379, 7.5432, 0.2876, 7.5432,
            ],
            spans: [
              {
                offset: 647,
                length: 8,
              },
            ],
          },
          {
            content: "00 075 00",
            boundingBox: [
              2.8706, 7.4357, 3.6016, 7.4357, 3.6016, 7.5433, 2.8706, 7.5433,
            ],
            spans: [
              {
                offset: 656,
                length: 9,
              },
            ],
          },
          {
            content: "AS-Zeit 21.05.",
            boundingBox: [
              0.2804, 7.5973, 1.4103, 7.5973, 1.4103, 7.71, 0.2804, 7.71,
            ],
            spans: [
              {
                offset: 666,
                length: 14,
              },
            ],
          },
          {
            content: "11:35 Uhr",
            boundingBox: [
              2.8758, 7.5958, 3.6041, 7.5958, 3.6041, 7.71, 2.8758, 7.71,
            ],
            spans: [
              {
                offset: 681,
                length: 9,
              },
            ],
          },
          {
            content: "AS-Proc-Code = 00 075 00",
            boundingBox: [
              0.9471, 7.7625, 2.9349, 7.7625, 2.9349, 7.8767, 0.9471, 7.8767,
            ],
            spans: [
              {
                offset: 691,
                length: 24,
              },
            ],
          },
          {
            content: "Capt.-Ref.= 0000",
            boundingBox: [
              1.2846, 7.9282, 2.6016, 7.9282, 2.6016, 8.0693, 1.2846, 8.0693,
            ],
            spans: [
              {
                offset: 716,
                length: 16,
              },
            ],
          },
          {
            content: "APPROVED",
            boundingBox: [
              1.6138, 8.1012, 2.2711, 8.1012, 2.2711, 8.21, 1.6138, 8.21,
            ],
            spans: [
              {
                offset: 733,
                length: 8,
              },
            ],
          },
          {
            content: "Betrag EUR",
            boundingBox: [
              0.2858, 8.2695, 1.1051, 8.2695, 1.1051, 8.4035, 0.2858, 8.4035,
            ],
            spans: [
              {
                offset: 742,
                length: 10,
              },
            ],
          },
          {
            content: "15,55",
            boundingBox: [
              3.2091, 8.2695, 3.6019, 8.2695, 3.6019, 8.4028, 3.2091, 8.4028,
            ],
            spans: [
              {
                offset: 753,
                length: 5,
              },
            ],
          },
          {
            content: "Zahlung erfolgt",
            boundingBox: [
              1.3694, 8.4282, 2.6018, 8.4282, 2.6018, 8.5702, 1.3694, 8.5702,
            ],
            spans: [
              {
                offset: 759,
                length: 15,
              },
            ],
          },
          {
            content: "Steuer",
            boundingBox: [
              0.3468, 8.7533, 0.71, 8.7533, 0.71, 8.8346, 0.3468, 8.8346,
            ],
            spans: [
              {
                offset: 775,
                length: 6,
              },
            ],
          },
          {
            content: "%",
            boundingBox: [
              0.8438, 8.753, 0.9005, 8.753, 0.9005, 8.8345, 0.8438, 8.8345,
            ],
            spans: [
              {
                offset: 782,
                length: 1,
              },
            ],
          },
          {
            content: "B=",
            boundingBox: [
              0.3463, 8.8793, 0.4598, 8.8793, 0.4598, 8.9583, 0.3463, 8.9583,
            ],
            spans: [
              {
                offset: 784,
                length: 2,
              },
            ],
          },
          {
            content: "7,0%",
            boundingBox: [
              0.6627, 8.878, 0.9005, 8.878, 0.9005, 8.9792, 0.6627, 8.9792,
            ],
            spans: [
              {
                offset: 787,
                length: 4,
              },
            ],
          },
          {
            content: "Gesamtbetrag",
            boundingBox: [
              0.3447, 8.999, 1.0872, 8.999, 1.0872, 9.1047, 0.3447, 9.1047,
            ],
            spans: [
              {
                offset: 792,
                length: 12,
              },
            ],
          },
          {
            content: "Netto",
            boundingBox: [
              1.534, 8.7543, 1.8354, 8.7543, 1.8354, 8.8345, 1.534, 8.8345,
            ],
            spans: [
              {
                offset: 805,
                length: 5,
              },
            ],
          },
          {
            content: "14,53",
            boundingBox: [
              1.5388, 8.8788, 1.8312, 8.8788, 1.8312, 8.9792, 1.5388, 8.9792,
            ],
            spans: [
              {
                offset: 811,
                length: 5,
              },
            ],
          },
          {
            content: "14,53",
            boundingBox: [
              1.5388, 9.0038, 1.8312, 9.0038, 1.8312, 9.1042, 1.5388, 9.1042,
            ],
            spans: [
              {
                offset: 817,
                length: 5,
              },
            ],
          },
          {
            content: "Steuer",
            boundingBox: [
              2.3468, 8.7533, 2.71, 8.7533, 2.71, 8.8346, 2.3468, 8.8346,
            ],
            spans: [
              {
                offset: 823,
                length: 6,
              },
            ],
          },
          {
            content: "1,02",
            boundingBox: [
              2.4763, 8.8788, 2.7077, 8.8788, 2.7077, 8.9792, 2.4763, 8.9792,
            ],
            spans: [
              {
                offset: 830,
                length: 4,
              },
            ],
          },
          {
            content: "1,02",
            boundingBox: [
              2.4763, 9.0038, 2.7077, 9.0038, 2.7077, 9.1042, 2.4763, 9.1042,
            ],
            spans: [
              {
                offset: 835,
                length: 4,
              },
            ],
          },
          {
            content: "Brutto",
            boundingBox: [
              3.2213, 8.7543, 3.5854, 8.7543, 3.5854, 8.8346, 3.2213, 8.8346,
            ],
            spans: [
              {
                offset: 840,
                length: 6,
              },
            ],
          },
          {
            content: "15,55",
            boundingBox: [
              3.2888, 8.8792, 3.5834, 8.8792, 3.5834, 8.9792, 3.2888, 8.9792,
            ],
            spans: [
              {
                offset: 847,
                length: 5,
              },
            ],
          },
          {
            content: "15,55",
            boundingBox: [
              3.2888, 9.0042, 3.5834, 9.0042, 3.5834, 9.1042, 3.2888, 9.1042,
            ],
            spans: [
              {
                offset: 853,
                length: 5,
              },
            ],
          },
          {
            content: "TSE-Signatur:",
            boundingBox: [
              0.2817, 9.2918, 1.065, 9.2918, 1.065, 9.3964, 0.2817, 9.3964,
            ],
            spans: [
              {
                offset: 859,
                length: 13,
              },
            ],
          },
          {
            content: "CURezCxAege6BbDXvtcNRO13FbL6/E1zX",
            boundingBox: [
              1.5954, 9.2906, 3.6488, 9.2906, 3.6488, 9.3964, 1.5954, 9.3964,
            ],
            spans: [
              {
                offset: 873,
                length: 33,
              },
            ],
          },
          {
            content: "oyeC0BM7Kbgfnrbyh258bYpNQmRz40YcG",
            boundingBox: [
              1.5952, 9.4149, 3.6478, 9.4149, 3.6478, 9.5216, 1.5952, 9.5216,
            ],
            spans: [
              {
                offset: 907,
                length: 33,
              },
            ],
          },
          {
            content: "xI+S19z9Fh5uyWGpt5azfzUQC9BnF9hAV",
            boundingBox: [
              1.5962, 9.5399, 3.65, 9.5399, 3.65, 9.6466, 1.5962, 9.6466,
            ],
            spans: [
              {
                offset: 941,
                length: 33,
              },
            ],
          },
          {
            content: "6/gURcO7KOf63OzUPFx1KBcZVCb4i",
            boundingBox: [
              1.5987, 9.6649, 3.3898, 9.6649, 3.3898, 9.7714, 1.5987, 9.7714,
            ],
            spans: [
              {
                offset: 975,
                length: 29,
              },
            ],
          },
          {
            content: "TSE-Signaturzähler:",
            boundingBox: [
              0.7817, 9.7906, 1.94, 9.7906, 1.94, 9.8964, 0.7817, 9.8964,
            ],
            spans: [
              {
                offset: 1005,
                length: 19,
              },
            ],
          },
          {
            content: "341392",
            boundingBox: [
              2.0989, 9.7955, 2.4577, 9.7955, 2.4577, 9.8762, 2.0989, 9.8762,
            ],
            spans: [
              {
                offset: 1025,
                length: 6,
              },
            ],
          },
          {
            content: "TSE-Transaktion:",
            boundingBox: [
              0.7817, 9.9156, 1.7525, 9.9156, 1.7525, 10.0012, 0.7817, 10.0012,
            ],
            spans: [
              {
                offset: 1032,
                length: 16,
              },
            ],
          },
          {
            content: "163235",
            boundingBox: [
              2.1013, 9.9201, 2.4584, 9.9201, 2.4584, 10.0012, 2.1013, 10.0012,
            ],
            spans: [
              {
                offset: 1049,
                length: 6,
              },
            ],
          },
          {
            content: "TSE-Start:",
            boundingBox: [
              0.5317, 10.045, 1.1275, 10.045, 1.1275, 10.1262, 0.5317, 10.1262,
            ],
            spans: [
              {
                offset: 1056,
                length: 10,
              },
            ],
          },
          {
            content: "2022-05-21T11:35:03.000",
            boundingBox: [
              1.8475, 10.0455, 3.2707, 10.0455, 3.2707, 10.1262, 1.8475,
              10.1262,
            ],
            spans: [
              {
                offset: 1067,
                length: 23,
              },
            ],
          },
          {
            content: "TSE-Stop:",
            boundingBox: [
              0.5317, 10.17, 1.065, 10.17, 1.065, 10.2708, 0.5317, 10.2708,
            ],
            spans: [
              {
                offset: 1091,
                length: 9,
              },
            ],
          },
          {
            content: "2022-05-21T11:35:38.000",
            boundingBox: [
              1.8475, 10.17, 3.2707, 10.17, 3.2707, 10.2512, 1.8475, 10.2512,
            ],
            spans: [
              {
                offset: 1101,
                length: 23,
              },
            ],
          },
          {
            content: "Seriennnummer Kasse: REWE:e0:d5:5e:c6:d3:3a:00",
            boundingBox: [
              0.5343, 10.2906, 3.3957, 10.2906, 3.3957, 10.3762, 0.5343,
              10.3762,
            ],
            spans: [
              {
                offset: 1125,
                length: 46,
              },
            ],
          },
          {
            content: "21.05.2022",
            boundingBox: [
              0.4541, 10.4357, 1.2676, 10.4357, 1.2676, 10.5433, 0.4541,
              10.5433,
            ],
            spans: [
              {
                offset: 1172,
                length: 10,
              },
            ],
          },
          {
            content: "11:35",
            boundingBox: [
              1.7091, 10.4357, 2.1019, 10.4357, 2.1019, 10.5433, 1.7091,
              10.5433,
            ],
            spans: [
              {
                offset: 1183,
                length: 5,
              },
            ],
          },
          {
            content: "Bon-Nr.:5580",
            boundingBox: [
              2.5358, 10.435, 3.5183, 10.435, 3.5183, 10.5433, 2.5358, 10.5433,
            ],
            spans: [
              {
                offset: 1189,
                length: 12,
              },
            ],
          },
          {
            content: "Markt:6008",
            boundingBox: [
              0.4513, 10.5958, 1.2679, 10.5958, 1.2679, 10.71, 0.4513, 10.71,
            ],
            spans: [
              {
                offset: 1202,
                length: 10,
              },
            ],
          },
          {
            content: "Kasse:1",
            boundingBox: [
              1.7014, 10.6022, 2.2444, 10.6022, 2.2444, 10.71, 1.7014, 10.71,
            ],
            spans: [
              {
                offset: 1213,
                length: 7,
              },
            ],
          },
          {
            content: "Bed.:404040",
            boundingBox: [
              2.5358, 10.5958, 3.4349, 10.5958, 3.4349, 10.71, 2.5358, 10.71,
            ],
            spans: [
              {
                offset: 1221,
                length: 11,
              },
            ],
          },
          {
            content: "****************************************",
            boundingBox: [
              0.3679, 10.7843, 3.6874, 10.7843, 3.6874, 10.8545, 0.3679,
              10.8545,
            ],
            spans: [
              {
                offset: 1233,
                length: 40,
              },
            ],
          },
          {
            content: "Ihre REWE PAYBACK Vorteile heute",
            boundingBox: [
              0.7899, 11.0933, 3.4373, 11.0933, 3.4373, 11.2115, 0.7899,
              11.2115,
            ],
            spans: [
              {
                offset: 1274,
                length: 32,
              },
            ],
          },
          {
            content: "PAYBACK Karten-Nr.: #########0111",
            boundingBox: [
              0.7043, 11.2678, 3.4111, 11.2678, 3.4111, 11.3767, 0.7043,
              11.3767,
            ],
            spans: [
              {
                offset: 1307,
                length: 33,
              },
            ],
          },
        ],
        spans: [
          {
            offset: 0,
            length: 1340,
          },
        ],
      },
      {
        pageNumber: 2,
        angle: 0,
        width: 3.9306,
        height: 11.6806,
        unit: "inch",
        words: [
          {
            content: "Punktestand",
            boundingBox: [
              0.7876, 0.6653, 1.6859, 0.6653, 1.6859, 0.7794, 0.7876, 0.7794,
            ],
            confidence: 1,
            span: {
              offset: 1341,
              length: 11,
            },
          },
          {
            content: "vor",
            boundingBox: [
              1.7844, 0.6986, 2.0208, 0.6986, 2.0208, 0.7789, 1.7844, 0.7789,
            ],
            confidence: 1,
            span: {
              offset: 1353,
              length: 3,
            },
          },
          {
            content: "Einkauf:",
            boundingBox: [
              2.1209, 0.6643, 2.7441, 0.6643, 2.7441, 0.7794, 2.1209, 0.7794,
            ],
            confidence: 1,
            span: {
              offset: 1357,
              length: 8,
            },
          },
          {
            content: "1.031",
            boundingBox: [
              2.8758, 0.6718, 3.2444, 0.6718, 3.2444, 0.7794, 2.8758, 0.7794,
            ],
            confidence: 1,
            span: {
              offset: 1366,
              length: 5,
            },
          },
          {
            content: "Punktestand",
            boundingBox: [
              0.6209, 0.8319, 1.5193, 0.8319, 1.5193, 0.9461, 0.6209, 0.9461,
            ],
            confidence: 1,
            span: {
              offset: 1372,
              length: 11,
            },
          },
          {
            content: "entspricht:",
            boundingBox: [
              1.6193, 0.8319, 2.4941, 0.8319, 2.4941, 0.9721, 1.6193, 0.9721,
            ],
            confidence: 1,
            span: {
              offset: 1384,
              length: 11,
            },
          },
          {
            content: "10,31",
            boundingBox: [
              2.6258, 0.8384, 2.9944, 0.8384, 2.9944, 0.9723, 2.6258, 0.9723,
            ],
            confidence: 1,
            span: {
              offset: 1396,
              length: 5,
            },
          },
          {
            content: "EUR",
            boundingBox: [
              3.1209, 0.8389, 3.3551, 0.8389, 3.3551, 0.9461, 3.1209, 0.9461,
            ],
            confidence: 1,
            span: {
              offset: 1402,
              length: 3,
            },
          },
          {
            content: "Sie",
            boundingBox: [
              0.6158, 1.1628, 0.8539, 1.1628, 0.8539, 1.2806, 0.6158, 1.2806,
            ],
            confidence: 1,
            span: {
              offset: 1406,
              length: 3,
            },
          },
          {
            content: "erhalten",
            boundingBox: [
              0.9506, 1.1636, 1.6031, 1.1636, 1.6031, 1.2803, 0.9506, 1.2803,
            ],
            confidence: 1,
            span: {
              offset: 1410,
              length: 8,
            },
          },
          {
            content: "7",
            boundingBox: [
              1.7054, 1.1724, 1.7679, 1.1724, 1.7679, 1.2778, 1.7054, 1.2778,
            ],
            confidence: 1,
            span: {
              offset: 1419,
              length: 1,
            },
          },
          {
            content: "PAYBACK",
            boundingBox: [
              1.8694, 1.1698, 2.4454, 1.1698, 2.4454, 1.2806, 1.8694, 1.2806,
            ],
            confidence: 1,
            span: {
              offset: 1421,
              length: 7,
            },
          },
          {
            content: "Punkte",
            boundingBox: [
              2.5361, 1.1636, 3.0206, 1.1636, 3.0206, 1.2809, 2.5361, 1.2809,
            ],
            confidence: 1,
            span: {
              offset: 1429,
              length: 6,
            },
          },
          {
            content: "auf",
            boundingBox: [
              3.1178, 1.1623, 3.3589, 1.1623, 3.3589, 1.2809, 3.1178, 1.2809,
            ],
            confidence: 1,
            span: {
              offset: 1436,
              length: 3,
            },
          },
          {
            content: "einen",
            boundingBox: [
              0.5339, 1.3294, 0.9364, 1.3294, 0.9364, 1.4469, 0.5339, 1.4469,
            ],
            confidence: 1,
            span: {
              offset: 1440,
              length: 5,
            },
          },
          {
            content: "PAYBACK",
            boundingBox: [
              1.0361, 1.3364, 1.6121, 1.3364, 1.6121, 1.4473, 1.0361, 1.4473,
            ],
            confidence: 1,
            span: {
              offset: 1446,
              length: 7,
            },
          },
          {
            content: "Umsatz",
            boundingBox: [
              1.7006, 1.3391, 2.1873, 1.3391, 2.1873, 1.4469, 1.7006, 1.4469,
            ],
            confidence: 1,
            span: {
              offset: 1454,
              length: 6,
            },
          },
          {
            content: "von",
            boundingBox: [
              2.2819, 1.3638, 2.5198, 1.3638, 2.5198, 1.4469, 2.2819, 1.4469,
            ],
            confidence: 1,
            span: {
              offset: 1461,
              length: 3,
            },
          },
          {
            content: "15,55",
            boundingBox: [
              2.6236, 1.3391, 3.0213, 1.3391, 3.0213, 1.4724, 2.6236, 1.4724,
            ],
            confidence: 1,
            span: {
              offset: 1465,
              length: 5,
            },
          },
          {
            content: "EUR!",
            boundingBox: [
              3.1204, 1.3309, 3.4141, 1.3309, 3.4141, 1.4466, 3.1204, 1.4466,
            ],
            confidence: 1,
            span: {
              offset: 1471,
              length: 4,
            },
          },
          {
            content: "Jetzt",
            boundingBox: [
              0.6193, 1.6724, 1.0184, 1.6724, 1.0184, 1.7794, 0.6193, 1.7794,
            ],
            confidence: 1,
            span: {
              offset: 1476,
              length: 5,
            },
          },
          {
            content: "mit",
            boundingBox: [
              1.1174, 1.6668, 1.3518, 1.6668, 1.3518, 1.7788, 1.1174, 1.7788,
            ],
            confidence: 1,
            span: {
              offset: 1482,
              length: 3,
            },
          },
          {
            content: "PAYBACK",
            boundingBox: [
              1.4543, 1.6706, 2.0229, 1.6706, 2.0229, 1.7793, 1.4543, 1.7793,
            ],
            confidence: 1,
            span: {
              offset: 1486,
              length: 7,
            },
          },
          {
            content: "Punkten",
            boundingBox: [
              2.1209, 1.6653, 2.6829, 1.6653, 2.6829, 1.7794, 2.1209, 1.7794,
            ],
            confidence: 1,
            span: {
              offset: 1494,
              length: 7,
            },
          },
          {
            content: "bezahlen!",
            boundingBox: [
              2.7878, 1.6648, 3.4943, 1.6648, 3.4943, 1.7794, 2.7878, 1.7794,
            ],
            confidence: 1,
            span: {
              offset: 1502,
              length: 9,
            },
          },
          {
            content: "Einfach",
            boundingBox: [
              0.3709, 1.8309, 0.9331, 1.8309, 0.9331, 1.9461, 0.3709, 1.9461,
            ],
            confidence: 1,
            span: {
              offset: 1512,
              length: 7,
            },
          },
          {
            content: "REWE",
            boundingBox: [
              1.0371, 1.8389, 1.3513, 1.8389, 1.3513, 1.9444, 1.0371, 1.9444,
            ],
            confidence: 1,
            span: {
              offset: 1520,
              length: 4,
            },
          },
          {
            content: "Guthaben",
            boundingBox: [
              1.4503, 1.8319, 2.0996, 1.8319, 2.0996, 1.9461, 1.4503, 1.9461,
            ],
            confidence: 1,
            span: {
              offset: 1525,
              length: 8,
            },
          },
          {
            content: "am",
            boundingBox: [
              2.2026, 1.8653, 2.3563, 1.8653, 2.3563, 1.9461, 2.2026, 1.9461,
            ],
            confidence: 1,
            span: {
              offset: 1534,
              length: 2,
            },
          },
          {
            content: "Service-Punkt",
            boundingBox: [
              2.4531, 1.8319, 3.5184, 1.8319, 3.5184, 1.9461, 2.4531, 1.9461,
            ],
            confidence: 1,
            span: {
              offset: 1537,
              length: 13,
            },
          },
          {
            content: "aufladen.",
            boundingBox: [
              2.2026, 1.9976, 2.9103, 1.9976, 2.9103, 2.1128, 2.2026, 2.1128,
            ],
            confidence: 1,
            span: {
              offset: 1551,
              length: 9,
            },
          },
          {
            content: "****************************************",
            boundingBox: [
              0.3679, 2.3538, 3.6874, 2.3538, 3.6874, 2.4239, 0.3679, 2.4239,
            ],
            confidence: 1,
            span: {
              offset: 1561,
              length: 40,
            },
          },
          {
            content: "Vielen",
            boundingBox: [
              0.6986, 2.6653, 1.1829, 2.6653, 1.1829, 2.7793, 0.6986, 2.7793,
            ],
            confidence: 1,
            span: {
              offset: 1602,
              length: 6,
            },
          },
          {
            content: "Dank",
            boundingBox: [
              1.2868, 2.6653, 1.6076, 2.6653, 1.6076, 2.7794, 1.2868, 2.7794,
            ],
            confidence: 1,
            span: {
              offset: 1609,
              length: 4,
            },
          },
          {
            content: "für",
            boundingBox: [
              1.7049, 2.6643, 1.9374, 2.6643, 1.9374, 2.7794, 1.7049, 2.7794,
            ],
            confidence: 1,
            span: {
              offset: 1614,
              length: 3,
            },
          },
          {
            content: "Ihren",
            boundingBox: [
              2.0413, 2.6653, 2.4329, 2.6653, 2.4329, 2.7793, 2.0413, 2.7793,
            ],
            confidence: 1,
            span: {
              offset: 1618,
              length: 5,
            },
          },
          {
            content: "Einkauf",
            boundingBox: [
              2.5376, 2.6643, 3.1066, 2.6643, 3.1066, 2.7794, 2.5376, 2.7794,
            ],
            confidence: 1,
            span: {
              offset: 1624,
              length: 7,
            },
          },
          {
            content: "Mo.",
            boundingBox: [
              0.7013, 3.1723, 0.9103, 3.1723, 0.9103, 3.2794, 0.7013, 3.2794,
            ],
            confidence: 1,
            span: {
              offset: 1632,
              length: 3,
            },
          },
          {
            content: "Wir",
            boundingBox: [
              1.1139, 3.0001, 1.3541, 3.0001, 1.3541, 3.1111, 1.1139, 3.1111,
            ],
            confidence: 1,
            span: {
              offset: 1636,
              length: 3,
            },
          },
          {
            content: "sind",
            boundingBox: [
              1.4539, 2.9986, 1.7693, 2.9986, 1.7693, 3.1126, 1.4539, 3.1126,
            ],
            confidence: 1,
            span: {
              offset: 1640,
              length: 4,
            },
          },
          {
            content: "für",
            boundingBox: [
              1.8716, 2.9976, 2.1041, 2.9976, 2.1041, 3.1128, 1.8716, 3.1128,
            ],
            confidence: 1,
            span: {
              offset: 1645,
              length: 3,
            },
          },
          {
            content: "Sie",
            boundingBox: [
              2.2031, 3.0001, 2.4353, 3.0001, 2.4353, 3.1126, 2.2031, 3.1126,
            ],
            confidence: 1,
            span: {
              offset: 1649,
              length: 3,
            },
          },
          {
            content: "da:",
            boundingBox: [
              2.5353, 2.9986, 2.7441, 2.9986, 2.7441, 3.1128, 2.5353, 3.1128,
            ],
            confidence: 1,
            span: {
              offset: 1653,
              length: 3,
            },
          },
          {
            content: "-",
            boundingBox: [
              1.0463, 3.2189, 1.0929, 3.2189, 1.0929, 3.2309, 1.0463, 3.2309,
            ],
            confidence: 1,
            span: {
              offset: 1657,
              length: 1,
            },
          },
          {
            content: "Sa.",
            boundingBox: [
              1.2031, 3.1711, 1.4103, 3.1711, 1.4103, 3.2794, 1.2031, 3.2794,
            ],
            confidence: 1,
            span: {
              offset: 1659,
              length: 3,
            },
          },
          {
            content: "07:00",
            boundingBox: [
              1.5373, 3.1718, 1.9349, 3.1718, 1.9349, 3.2794, 1.5373, 3.2794,
            ],
            confidence: 1,
            span: {
              offset: 1663,
              length: 5,
            },
          },
          {
            content: "bis",
            boundingBox: [
              2.0378, 3.1653, 2.2678, 3.1653, 2.2678, 3.2794, 2.0378, 3.2794,
            ],
            confidence: 1,
            span: {
              offset: 1669,
              length: 3,
            },
          },
          {
            content: "22:00",
            boundingBox: [
              2.3708, 3.1718, 2.7683, 3.1718, 2.7683, 3.2794, 2.3708, 3.2794,
            ],
            confidence: 1,
            span: {
              offset: 1673,
              length: 5,
            },
          },
          {
            content: "Uhr",
            boundingBox: [
              2.8694, 3.1653, 3.1041, 3.1653, 3.1041, 3.2794, 2.8694, 3.2794,
            ],
            confidence: 1,
            span: {
              offset: 1679,
              length: 3,
            },
          },
          {
            content: "Sie",
            boundingBox: [
              1.2031, 3.5001, 1.4353, 3.5001, 1.4353, 3.6126, 1.2031, 3.6126,
            ],
            confidence: 1,
            span: {
              offset: 1683,
              length: 3,
            },
          },
          {
            content: "haben",
            boundingBox: [
              1.5399, 3.4986, 1.9329, 3.4986, 1.9329, 3.6128, 1.5399, 3.6128,
            ],
            confidence: 1,
            span: {
              offset: 1687,
              length: 5,
            },
          },
          {
            content: "Fragen?",
            boundingBox: [
              2.0408, 3.4986, 2.6001, 3.4986, 2.6001, 3.6396, 2.0408, 3.6396,
            ],
            confidence: 1,
            span: {
              offset: 1693,
              length: 7,
            },
          },
          {
            content: "Antworten",
            boundingBox: [
              0.4471, 3.6706, 1.1829, 3.6706, 1.1829, 3.7793, 0.4471, 3.7793,
            ],
            confidence: 1,
            span: {
              offset: 1701,
              length: 9,
            },
          },
          {
            content: "gibt",
            boundingBox: [
              1.2841, 3.6653, 1.6018, 3.6653, 1.6018, 3.8063, 1.2841, 3.8063,
            ],
            confidence: 1,
            span: {
              offset: 1711,
              length: 4,
            },
          },
          {
            content: "es",
            boundingBox: [
              1.7026, 3.6986, 1.8511, 3.6986, 1.8511, 3.7793, 1.7026, 3.7793,
            ],
            confidence: 1,
            span: {
              offset: 1716,
              length: 2,
            },
          },
          {
            content: "unter",
            boundingBox: [
              1.9549, 3.6774, 2.3541, 3.6774, 2.3541, 3.7794, 1.9549, 3.7794,
            ],
            confidence: 1,
            span: {
              offset: 1719,
              length: 5,
            },
          },
          {
            content: "www.rewe.de",
            boundingBox: [
              2.4471, 3.6653, 3.3519, 3.6653, 3.3519, 3.7794, 2.4471, 3.7794,
            ],
            confidence: 1,
            span: {
              offset: 1725,
              length: 11,
            },
          },
          {
            content: "Tel.:",
            boundingBox: [
              1.1996, 3.9986, 1.5774, 3.9986, 1.5774, 4.1128, 1.1996, 4.1128,
            ],
            confidence: 1,
            span: {
              offset: 1737,
              length: 5,
            },
          },
          {
            content: "030-20859548",
            boundingBox: [
              1.7039, 4.0044, 2.6846, 4.0044, 2.6846, 4.1128, 1.7039, 4.1128,
            ],
            confidence: 1,
            span: {
              offset: 1743,
              length: 12,
            },
          },
        ],
        lines: [
          {
            content: "Punktestand vor Einkauf: 1.031",
            boundingBox: [
              0.7876, 0.6643, 3.2444, 0.6643, 3.2444, 0.7794, 0.7876, 0.7794,
            ],
            spans: [
              {
                offset: 1341,
                length: 30,
              },
            ],
          },
          {
            content: "Punktestand entspricht: 10,31 EUR",
            boundingBox: [
              0.6209, 0.8319, 3.3551, 0.8319, 3.3551, 0.9723, 0.6209, 0.9723,
            ],
            spans: [
              {
                offset: 1372,
                length: 33,
              },
            ],
          },
          {
            content: "Sie erhalten 7 PAYBACK Punkte auf",
            boundingBox: [
              0.6158, 1.1623, 3.3589, 1.1623, 3.3589, 1.2809, 0.6158, 1.2809,
            ],
            spans: [
              {
                offset: 1406,
                length: 33,
              },
            ],
          },
          {
            content: "einen PAYBACK Umsatz von 15,55 EUR!",
            boundingBox: [
              0.5339, 1.3294, 3.4141, 1.3294, 3.4141, 1.4724, 0.5339, 1.4724,
            ],
            spans: [
              {
                offset: 1440,
                length: 35,
              },
            ],
          },
          {
            content: "Jetzt mit PAYBACK Punkten bezahlen!",
            boundingBox: [
              0.6193, 1.6648, 3.4943, 1.6648, 3.4943, 1.7794, 0.6193, 1.7794,
            ],
            spans: [
              {
                offset: 1476,
                length: 35,
              },
            ],
          },
          {
            content: "Einfach REWE Guthaben am Service-Punkt",
            boundingBox: [
              0.3709, 1.8309, 3.5184, 1.8309, 3.5184, 1.9461, 0.3709, 1.9461,
            ],
            spans: [
              {
                offset: 1512,
                length: 38,
              },
            ],
          },
          {
            content: "aufladen.",
            boundingBox: [
              2.2026, 1.9976, 2.9103, 1.9976, 2.9103, 2.1128, 2.2026, 2.1128,
            ],
            spans: [
              {
                offset: 1551,
                length: 9,
              },
            ],
          },
          {
            content: "****************************************",
            boundingBox: [
              0.3679, 2.3538, 3.6874, 2.3538, 3.6874, 2.4239, 0.3679, 2.4239,
            ],
            spans: [
              {
                offset: 1561,
                length: 40,
              },
            ],
          },
          {
            content: "Vielen Dank für Ihren Einkauf",
            boundingBox: [
              0.6986, 2.6643, 3.1066, 2.6643, 3.1066, 2.7794, 0.6986, 2.7794,
            ],
            spans: [
              {
                offset: 1602,
                length: 29,
              },
            ],
          },
          {
            content: "Mo.",
            boundingBox: [
              0.7013, 3.1723, 0.9103, 3.1723, 0.9103, 3.2794, 0.7013, 3.2794,
            ],
            spans: [
              {
                offset: 1632,
                length: 3,
              },
            ],
          },
          {
            content: "Wir sind für Sie da:",
            boundingBox: [
              1.1139, 2.9976, 2.7441, 2.9976, 2.7441, 3.1128, 1.1139, 3.1128,
            ],
            spans: [
              {
                offset: 1636,
                length: 20,
              },
            ],
          },
          {
            content: "-",
            boundingBox: [
              1.0463, 3.2189, 1.0929, 3.2189, 1.0929, 3.2309, 1.0463, 3.2309,
            ],
            spans: [
              {
                offset: 1657,
                length: 1,
              },
            ],
          },
          {
            content: "Sa.",
            boundingBox: [
              1.2031, 3.1711, 1.4103, 3.1711, 1.4103, 3.2794, 1.2031, 3.2794,
            ],
            spans: [
              {
                offset: 1659,
                length: 3,
              },
            ],
          },
          {
            content: "07:00 bis 22:00 Uhr",
            boundingBox: [
              1.5373, 3.1653, 3.1041, 3.1653, 3.1041, 3.2794, 1.5373, 3.2794,
            ],
            spans: [
              {
                offset: 1663,
                length: 19,
              },
            ],
          },
          {
            content: "Sie haben Fragen?",
            boundingBox: [
              1.2031, 3.4986, 2.6001, 3.4986, 2.6001, 3.6396, 1.2031, 3.6396,
            ],
            spans: [
              {
                offset: 1683,
                length: 17,
              },
            ],
          },
          {
            content: "Antworten gibt es unter www.rewe.de",
            boundingBox: [
              0.4471, 3.6653, 3.3519, 3.6653, 3.3519, 3.8063, 0.4471, 3.8063,
            ],
            spans: [
              {
                offset: 1701,
                length: 35,
              },
            ],
          },
          {
            content: "Tel.: 030-20859548",
            boundingBox: [
              1.1996, 3.9986, 2.6846, 3.9986, 2.6846, 4.1128, 1.1996, 4.1128,
            ],
            spans: [
              {
                offset: 1737,
                length: 18,
              },
            ],
          },
        ],
        spans: [
          {
            offset: 1340,
            length: 415,
          },
        ],
      },
    ],
    styles: [],
    documents: [
      {
        docType: "receipt.retailMeal",
        boundingRegions: [
          {
            pageNumber: 1,
            boundingBox: [0, 0, 3.9306, 0, 3.9306, 11.6806, 0, 11.6806],
          },
        ],
        fields: {
          Items: {
            type: "array",
            valueArray: [
              {
                type: "object",
                valueObject: {
                  TotalPrice: {
                    type: "number",
                    valueNumber: 1.39,
                    content: "1,39",
                    boundingRegions: [
                      {
                        pageNumber: 1,
                        boundingBox: [
                          3.0424, 2.9357, 3.3509, 2.9357, 3.3509, 3.0695,
                          3.0424, 3.0695,
                        ],
                      },
                    ],
                    confidence: 0.557,
                    spans: [
                      {
                        offset: 225,
                        length: 4,
                      },
                    ],
                  },
                },
              },
              {
                type: "object",
                valueObject: {
                  Description: {
                    type: "string",
                    valueString: "FRISCH.DOPPELRA.",
                    content: "FRISCH.DOPPELRA.",
                    boundingRegions: [
                      {
                        pageNumber: 1,
                        boundingBox: [
                          0.2908, 3.1012, 1.5769, 3.1012, 1.5769, 3.21, 0.2908,
                          3.21,
                        ],
                      },
                    ],
                    confidence: 0.482,
                    spans: [
                      {
                        offset: 105,
                        length: 16,
                      },
                    ],
                  },
                  TotalPrice: {
                    type: "number",
                    valueNumber: 1.19,
                    content: "1,19",
                    boundingRegions: [
                      {
                        pageNumber: 1,
                        boundingBox: [
                          3.0424, 3.1023, 3.3509, 3.1023, 3.3509, 3.2362,
                          3.0424, 3.2362,
                        ],
                      },
                    ],
                    confidence: 0.546,
                    spans: [
                      {
                        offset: 232,
                        length: 4,
                      },
                    ],
                  },
                },
              },
              {
                type: "object",
                valueObject: {
                  Description: {
                    type: "string",
                    valueString: "BAGELS SESAM",
                    content: "BAGELS SESAM",
                    boundingRegions: [
                      {
                        pageNumber: 1,
                        boundingBox: [
                          0.2858, 3.2678, 1.2711, 3.2678, 1.2711, 3.3765,
                          0.2858, 3.3765,
                        ],
                      },
                    ],
                    confidence: 0.981,
                    spans: [
                      {
                        offset: 122,
                        length: 12,
                      },
                    ],
                  },
                  TotalPrice: {
                    type: "number",
                    valueNumber: 1.49,
                    content: "1,49",
                    boundingRegions: [
                      {
                        pageNumber: 1,
                        boundingBox: [
                          3.0424, 3.269, 3.3509, 3.269, 3.3509, 3.4028, 3.0424,
                          3.4028,
                        ],
                      },
                    ],
                    confidence: 0.986,
                    spans: [
                      {
                        offset: 239,
                        length: 4,
                      },
                    ],
                  },
                },
              },
              {
                type: "object",
                valueObject: {
                  Description: {
                    type: "string",
                    valueString: "ROGGENBROETCHEN",
                    content: "ROGGENBROETCHEN",
                    boundingRegions: [
                      {
                        pageNumber: 1,
                        boundingBox: [
                          0.2871, 3.4352, 1.5204, 3.4352, 1.5204, 3.5433,
                          0.2871, 3.5433,
                        ],
                      },
                    ],
                    confidence: 0.983,
                    spans: [
                      {
                        offset: 135,
                        length: 15,
                      },
                    ],
                  },
                  TotalPrice: {
                    type: "number",
                    valueNumber: 1.39,
                    content: "1,39",
                    boundingRegions: [
                      {
                        pageNumber: 1,
                        boundingBox: [
                          3.0424, 3.4357, 3.3509, 3.4357, 3.3509, 3.5695,
                          3.0424, 3.5695,
                        ],
                      },
                    ],
                    confidence: 0.986,
                    spans: [
                      {
                        offset: 246,
                        length: 4,
                      },
                    ],
                  },
                },
              },
              {
                type: "object",
                valueObject: {
                  Description: {
                    type: "string",
                    valueString: "TRAUBE KERNL.HEL",
                    content: "TRAUBE KERNL.HEL",
                    boundingRegions: [
                      {
                        pageNumber: 1,
                        boundingBox: [
                          0.2829, 3.6012, 1.6009, 3.6012, 1.6009, 3.71, 0.2829,
                          3.71,
                        ],
                      },
                    ],
                    confidence: 0.981,
                    spans: [
                      {
                        offset: 151,
                        length: 16,
                      },
                    ],
                  },
                  TotalPrice: {
                    type: "number",
                    valueNumber: 1.99,
                    content: "1,99",
                    boundingRegions: [
                      {
                        pageNumber: 1,
                        boundingBox: [
                          3.0424, 3.6023, 3.3509, 3.6023, 3.3509, 3.7362,
                          3.0424, 3.7362,
                        ],
                      },
                    ],
                    confidence: 0.986,
                    spans: [
                      {
                        offset: 253,
                        length: 4,
                      },
                    ],
                  },
                },
              },
              {
                type: "object",
                valueObject: {
                  Description: {
                    type: "string",
                    valueString: "SOFT DATTELN",
                    content: "SOFT DATTELN",
                    boundingRegions: [
                      {
                        pageNumber: 1,
                        boundingBox: [
                          0.2864, 3.7678, 1.2704, 3.7678, 1.2704, 3.8767,
                          0.2864, 3.8767,
                        ],
                      },
                    ],
                    confidence: 0.981,
                    spans: [
                      {
                        offset: 168,
                        length: 12,
                      },
                    ],
                  },
                  TotalPrice: {
                    type: "number",
                    valueNumber: 1.99,
                    content: "1,99",
                    boundingRegions: [
                      {
                        pageNumber: 1,
                        boundingBox: [
                          3.0424, 3.769, 3.3509, 3.769, 3.3509, 3.9028, 3.0424,
                          3.9028,
                        ],
                      },
                    ],
                    confidence: 0.986,
                    spans: [
                      {
                        offset: 260,
                        length: 4,
                      },
                    ],
                  },
                },
              },
              {
                type: "object",
                valueObject: {
                  Description: {
                    type: "string",
                    valueString: "AVOCADO VORGER.",
                    content: "AVOCADO VORGER.",
                    boundingRegions: [
                      {
                        pageNumber: 1,
                        boundingBox: [
                          0.2804, 3.9345, 1.4936, 3.9345, 1.4936, 4.0433,
                          0.2804, 4.0433,
                        ],
                      },
                    ],
                    confidence: 0.981,
                    spans: [
                      {
                        offset: 181,
                        length: 15,
                      },
                    ],
                  },
                  TotalPrice: {
                    type: "number",
                    valueNumber: 1.49,
                    content: "1,49",
                    boundingRegions: [
                      {
                        pageNumber: 1,
                        boundingBox: [
                          3.0424, 3.9357, 3.3509, 3.9357, 3.3509, 4.0695,
                          3.0424, 4.0695,
                        ],
                      },
                    ],
                    confidence: 0.986,
                    spans: [
                      {
                        offset: 267,
                        length: 4,
                      },
                    ],
                  },
                },
              },
              {
                type: "object",
                valueObject: {
                  Description: {
                    type: "string",
                    valueString: "RISPENTOMATE",
                    content: "RISPENTOMATE",
                    boundingRegions: [
                      {
                        pageNumber: 1,
                        boundingBox: [
                          0.2871, 4.1012, 1.2679, 4.1012, 1.2679, 4.21, 0.2871,
                          4.21,
                        ],
                      },
                    ],
                    confidence: 0.984,
                    spans: [
                      {
                        offset: 197,
                        length: 12,
                      },
                    ],
                  },
                  Price: {
                    type: "number",
                    valueNumber: 1.99,
                    content: "1,99",
                    boundingRegions: [
                      {
                        pageNumber: 1,
                        boundingBox: [
                          2.1258, 4.269, 2.4343, 4.269, 2.4343, 4.4028, 2.1258,
                          4.4028,
                        ],
                      },
                    ],
                    confidence: 0.984,
                    spans: [
                      {
                        offset: 281,
                        length: 4,
                      },
                    ],
                  },
                  Quantity: {
                    type: "number",
                    valueNumber: 568,
                    content: "0,568",
                    boundingRegions: [
                      {
                        pageNumber: 1,
                        boundingBox: [
                          1.0373, 4.2683, 1.4346, 4.2683, 1.4346, 4.4028,
                          1.0373, 4.4028,
                        ],
                      },
                    ],
                    confidence: 0.977,
                    spans: [
                      {
                        offset: 210,
                        length: 5,
                      },
                    ],
                  },
                  TotalPrice: {
                    type: "number",
                    valueNumber: 1.13,
                    content: "1,13",
                    boundingRegions: [
                      {
                        pageNumber: 1,
                        boundingBox: [
                          3.0424, 4.1023, 3.3489, 4.1023, 3.3489, 4.2362,
                          3.0424, 4.2362,
                        ],
                      },
                    ],
                    confidence: 0.986,
                    spans: [
                      {
                        offset: 274,
                        length: 4,
                      },
                    ],
                  },
                },
              },
              {
                type: "object",
                valueObject: {
                  Description: {
                    type: "string",
                    valueString: "BIO EIER S-XL",
                    content: "BIO EIER S-XL",
                    boundingRegions: [
                      {
                        pageNumber: 1,
                        boundingBox: [
                          0.2858, 4.435, 1.3509, 4.435, 1.3509, 4.5433, 0.2858,
                          4.5433,
                        ],
                      },
                    ],
                    confidence: 0.98,
                    spans: [
                      {
                        offset: 293,
                        length: 13,
                      },
                    ],
                  },
                  TotalPrice: {
                    type: "number",
                    valueNumber: 3.49,
                    content: "3,49",
                    boundingRegions: [
                      {
                        pageNumber: 1,
                        boundingBox: [
                          3.0393, 4.4357, 3.3509, 4.4357, 3.3509, 4.5695,
                          3.0393, 4.5695,
                        ],
                      },
                    ],
                    confidence: 0.986,
                    spans: [
                      {
                        offset: 307,
                        length: 4,
                      },
                    ],
                  },
                },
              },
            ],
          },
          Locale: {
            type: "string",
            valueString: "en-IN",
            confidence: 0.995,
          },
          MerchantAddress: {
            type: "string",
            valueString: "Bautzener Str. 36 10829 Berlin",
            content: "Bautzener Str. 36 10829 Berlin",
            boundingRegions: [
              {
                pageNumber: 1,
                boundingBox: [
                  1.1191, 2.2683, 2.5176, 2.2683, 2.5176, 2.5433, 1.1191,
                  2.5433,
                ],
              },
            ],
            confidence: 0.964,
            spans: [
              {
                offset: 36,
                length: 30,
              },
            ],
          },
          MerchantName: {
            type: "string",
            valueString: "GEBA Supermärkte GmbH & Co. KG",
            content: "GEBA Supermärkte GmbH & Co. KG",
            boundingRegions: [
              {
                pageNumber: 1,
                boundingBox: [
                  0.6169, 2.0958, 3.1044, 2.0958, 3.1044, 2.236, 0.6169, 2.236,
                ],
              },
            ],
            confidence: 0.948,
            spans: [
              {
                offset: 5,
                length: 30,
              },
            ],
          },
          Subtotal: {
            type: "number",
            valueNumber: 14.53,
            content: "14,53",
            boundingRegions: [
              {
                pageNumber: 1,
                boundingBox: [
                  1.5388, 9.0038, 1.8312, 9.0038, 1.8312, 9.1042, 1.5388,
                  9.1042,
                ],
              },
            ],
            confidence: 0.624,
            spans: [
              {
                offset: 817,
                length: 5,
              },
            ],
          },
          Total: {
            type: "number",
            valueNumber: 15.55,
            content: "15,55",
            boundingRegions: [
              {
                pageNumber: 1,
                boundingBox: [
                  3.0403, 4.7697, 3.4379, 4.7697, 3.4379, 4.903, 3.0403, 4.903,
                ],
              },
            ],
            confidence: 0.977,
            spans: [
              {
                offset: 363,
                length: 5,
              },
            ],
          },
          TransactionDate: {
            type: "date",
            valueDate: "2022-05-21",
            content: "21.05.2022",
            boundingRegions: [
              {
                pageNumber: 1,
                boundingBox: [
                  0.4541, 10.4357, 1.2676, 10.4357, 1.2676, 10.5433, 0.4541,
                  10.5433,
                ],
              },
            ],
            confidence: 0.965,
            spans: [
              {
                offset: 1172,
                length: 10,
              },
            ],
          },
          TransactionTime: {
            type: "time",
            valueTime: "11:35:17",
            content: "11:35:17",
            boundingRegions: [
              {
                pageNumber: 1,
                boundingBox: [
                  2.6258, 5.769, 3.2664, 5.769, 3.2664, 5.8767, 2.6258, 5.8767,
                ],
              },
            ],
            confidence: 0.977,
            spans: [
              {
                offset: 481,
                length: 8,
              },
            ],
          },
        },
        confidence: 0.99,
        spans: [
          {
            offset: 0,
            length: 1340,
          },
        ],
      },
      {
        docType: "receipt.retailMeal",
        boundingRegions: [
          {
            pageNumber: 2,
            boundingBox: [0, 0, 3.9306, 0, 3.9306, 11.6806, 0, 11.6806],
          },
        ],
        fields: {
          Locale: {
            type: "string",
            valueString: "en-AU",
            confidence: 0.99,
          },
          MerchantPhoneNumber: {
            type: "phoneNumber",
            valuePhoneNumber: "+61320859548",
            content: "030-20859548",
            boundingRegions: [
              {
                pageNumber: 2,
                boundingBox: [
                  1.7039, 4.0044, 2.6846, 4.0044, 2.6846, 4.1128, 1.7039,
                  4.1128,
                ],
              },
            ],
            confidence: 0.989,
            spans: [
              {
                offset: 1743,
                length: 12,
              },
            ],
          },
        },
        confidence: 0.99,
        spans: [
          {
            offset: 1340,
            length: 415,
          },
        ],
      },
    ],
  },
};
