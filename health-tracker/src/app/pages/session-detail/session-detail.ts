import { Component } from "@angular/core";

import { ConferenceData } from "../../providers/conference-data";
import { ActivatedRoute, Router } from "@angular/router";
import { UserData } from "../../providers/user-data";
import { Config, IonRouterOutlet } from "@ionic/angular";

@Component({
  selector: "page-session-detail",
  styleUrls: ["./session-detail.scss"],
  templateUrl: "session-detail.html",
})
export class SessionDetailPage {
  session: any;
  isFavorite = false;
  ios: boolean;
  defaultHref = "";

  public foodGroup = {
    name: "Example",
    foodItems: [{}],
  };
  constructor(
    private dataProvider: ConferenceData,
    private userProvider: UserData,
    private route: ActivatedRoute,
    public router: Router,
    public routerOutlet: IonRouterOutlet,
    public config: Config
  ) {}

  ngOnInit() {
    this.ios = this.config.get("mode") === "ios";
  }

  ionViewWillEnter() {
    this.foodGroup = {
      name: this.route.snapshot.paramMap.get("sessionId"),
      foodItems: [],
    };
    this.dataProvider.load().subscribe((data: any) => {
      if (
        data &&
        data.schedule &&
        data.schedule[0] &&
        data.schedule[0].groups
      ) {
        const sessionId = this.route.snapshot.paramMap.get("sessionId");
        for (const group of data.schedule[0].groups) {
          if (group && group.sessions) {
            for (const session of group.sessions) {
              if (session && session.id === sessionId) {
                this.session = session;

                this.isFavorite = this.userProvider.hasFavorite(
                  this.session.name
                );

                break;
              }
            }
          }
        }
      }
    });
  }

  ionViewDidEnter() {
    this.defaultHref = `/`;
  }
}
