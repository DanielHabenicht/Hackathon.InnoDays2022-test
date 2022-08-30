import { NgModule } from "@angular/core";
import { RouterModule, Routes } from "@angular/router";

import { IngestPage } from "./about";

const routes: Routes = [
  {
    path: "",
    component: IngestPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class IngestPageRoutingModule {}
