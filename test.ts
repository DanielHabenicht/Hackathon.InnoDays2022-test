const { FormRecognizerClient, AzureKeyCredential } = require('@azure/ai-form-recognizer');

const fs = require('fs');
const axios = require('axios');

const axiosconfig = {
  headers: {
    'Content-Type': 'application/json',
  },
};

function getUsableProductName(notUsableString) {
  const newString = notUsableString
    .toLowerCase()
    .replaceAll(/oe/gi, 'ö')
    .replaceAll(/ae/gi, 'ä')
    .replaceAll(/ue/gi, 'ü')
    .replaceAll('.', ' ');
  console.log(newString);
  return newString;
}

function getProductId(productstring) {
  if (productstring == undefined) {
    console.log('product undefined');
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
        var splits = converteditem.split(' ')[0];
        splits.pop;
        axios
          .get(
            `https://de.openfoodfacts.org/cgi/search.pl?search_terms=${
              converteditem.split(' ')[0]
            }&search_simple=1&action=process&json=true`,
            axiosconfig
          )
          .then((res) => {
            //   console.log(`statusCode: ${res.status}`);
            //   console.log(res.data);
            let jsonresponse = res.data;
            console.log(
              `    Item Name: '${converteditem}' Request '${converteditem.split(' ')[0]}' ${
                jsonresponse.products.length > 0 ? jsonresponse.products[0].product_name : 'none found'
              }`
            );
          })
          .catch((error) => {
            console.error(error);
          });
      } else {
        console.log(
          `    Item Name: '${converteditem}' ${
            jsonresponse.products.length > 0 ? jsonresponse.products[0].product_name : 'none found'
          }`
        );
      }
    })
    .catch((error) => {
      console.error(error);
    });
}

async function main() {
  const endpoint = 'https://germanywestcentral.api.cognitive.microsoft.com/';
  const apiKey = '86ff30ca03de45139e14598e58535a2b';
  const path = './REWE-eBon.pdf'; // pdf/jpeg/png/tiff formats

  const readStream = fs.createReadStream(path);

  const client = new FormRecognizerClient(endpoint, new AzureKeyCredential(apiKey));
  const poller = await client.beginRecognizeReceipts(readStream, {
    onProgress: (state) => {
      console.log(`status: ${state.status}`);
    },
  });

  const receipts = await poller.pollUntilDone();

  if (!receipts || receipts.length <= 0) {
    throw new Error('Expecting at lease one receipt in analysis result');
  }

  const receipt = receipts[0];
  console.log('First receipt:');
  const receiptTypeField = receipt.fields['ReceiptType'];
  if (receiptTypeField.valueType === 'string') {
    console.log(
      `  Receipt Type: '${receiptTypeField.value || '<missing>'}', with confidence of ${receiptTypeField.confidence}`
    );
  }
  const merchantNameField = receipt.fields['MerchantName'];
  if (merchantNameField.valueType === 'string') {
    console.log(
      `  Merchant Name: '${merchantNameField.value || '<missing>'}', with confidence of ${merchantNameField.confidence}`
    );
  }
  const transactionDate = receipt.fields['TransactionDate'];
  if (transactionDate.valueType === 'date') {
    console.log(
      `  Transaction Date: '${transactionDate.value || '<missing>'}', with confidence of ${transactionDate.confidence}`
    );
  }
  const itemsField = receipt.fields['Items'];
  if (itemsField.valueType === 'array') {
    for (const itemField of itemsField.value || []) {
      if (itemField.valueType === 'object') {
        const itemNameField = itemField.value['Name'];
        if (itemNameField.valueType === 'string') {
          console.log(
            `    Item Name: '${itemNameField.value || '<missing>'}', with confidence of ${itemNameField.confidence}`
          );
        }
      }
    }
  }
  const totalField = receipt.fields['Total'];
  if (totalField.valueType === 'number') {
    console.log(`  Total: '${totalField.value || '<missing>'}', with confidence of ${totalField.confidence}`);
  }

  // Get Product IDs
  if (itemsField.valueType === 'array') {
    for (const itemField of itemsField.value || []) {
      if (itemField.valueType === 'object') {
        const itemNameField = itemField.value['Name'];
        if (itemNameField.valueType === 'string') {
          getProductId(itemNameField.value);
        }
      }
    }
  }
}

main().catch((err) => {
  console.error('The sample encountered an error:', err);
});
