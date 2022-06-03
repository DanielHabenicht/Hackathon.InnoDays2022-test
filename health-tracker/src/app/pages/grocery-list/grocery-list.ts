import { Component } from "@angular/core";
import { Router } from "@angular/router";

import { Config, IonRouterOutlet, PopoverController } from "@ionic/angular";
import { UserData } from "../../providers/user-data";

import { PopoverPage } from "../about-popover/about-popover";

@Component({
  selector: "gorcery-list",
  templateUrl: "grocery-list.html",
  styleUrls: ["./grocery-list.scss"],
})
export class GroceryListPage {
  ios: boolean;

  location = "madison";
  conferenceDate = "2047-05-17";

  selectOptions = {
    header: "Select a Location",
  };

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
}
