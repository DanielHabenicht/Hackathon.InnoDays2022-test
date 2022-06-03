import { NgModule } from "@angular/core";
import { RouterModule, Routes } from "@angular/router";

import { GroceryListPage } from "./grocery-list";

const routes: Routes = [
  {
    path: "",
    component: GroceryListPage,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class GroceryListPageRoutingModule {}
