import { NgModule } from "@angular/core";
import { CommonModule } from "@angular/common";
import { IonicModule } from "@ionic/angular";

import { TabsPage } from "./tabs-page";
import { TabsPageRoutingModule } from "./tabs-page-routing.module";

import { AboutModule } from "../about/about.module";
import { MapModule } from "../map/map.module";
import { ScheduleModule } from "../schedule/schedule.module";
import { SessionDetailModule } from "../session-detail/session-detail.module";
import { SpeakerDetailModule } from "../speaker-detail/speaker-detail.module";
import { SpeakerListModule } from "../speaker-list/speaker-list.module";
import { GroceryListModule } from "../grocery-list/grocery-list.module";
import { IngestModule } from "../ingest/about.module";

@NgModule({
  imports: [
    AboutModule,
    GroceryListModule,
    CommonModule,
    IonicModule,
    MapModule,
    ScheduleModule,
    SessionDetailModule,
    SpeakerDetailModule,
    SpeakerListModule,
    TabsPageRoutingModule,
    IngestModule,
  ],
  declarations: [TabsPage],
})
export class TabsModule {}
