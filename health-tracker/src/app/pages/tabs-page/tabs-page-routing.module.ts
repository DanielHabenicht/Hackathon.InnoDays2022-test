import { NgModule } from "@angular/core";
import { RouterModule, Routes } from "@angular/router";
import { TabsPage } from "./tabs-page";
import { SchedulePage } from "../schedule/schedule";
import { IngestPage } from "../ingest/about";

const routes: Routes = [
  {
    path: "tabs",
    component: TabsPage,
    children: [
      {
        path: "dashboard",
        children: [
          {
            path: "",
            component: SchedulePage,
          },
          {
            path: "ingest",
            component: IngestPage,
          },
          {
            path: "food/:sessionId",
            loadChildren: () =>
              import("../session-detail/session-detail.module").then(
                (m) => m.SessionDetailModule
              ),
          },
        ],
      },
      {
        path: "recipes",
        children: [
          {
            path: "",
            loadChildren: () =>
              import("../speaker-list/speaker-list.module").then(
                (m) => m.SpeakerListModule
              ),
          },
          {
            path: "speaker-details/:speakerId",
            loadChildren: () =>
              import("../speaker-detail/speaker-detail.module").then(
                (m) => m.SpeakerDetailModule
              ),
          },
        ],
      },
      {
        path: "map",
        children: [
          {
            path: "",
            loadChildren: () =>
              import("../map/map.module").then((m) => m.MapModule),
          },
        ],
      },
      {
        path: "grocery-list",
        children: [
          {
            path: "",
            loadChildren: () =>
              import("../grocery-list/grocery-list.module").then(
                (m) => m.GroceryListModule
              ),
          },
        ],
      },
      {
        path: "",
        redirectTo: "/app/tabs/dashboard",
        // pathMatch: "full",
      },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class TabsPageRoutingModule {}
