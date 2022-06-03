import { Component } from "@angular/core";
import { Router } from "@angular/router";

import { Config, IonRouterOutlet, PopoverController } from "@ionic/angular";
import { UserData } from "../../providers/user-data";

import { PopoverPage } from "../about-popover/about-popover";

@Component({
  selector: "page-about",
  templateUrl: "about.html",
  styleUrls: ["./about.scss"],
})
export class AboutPage {
  ios: boolean;
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
