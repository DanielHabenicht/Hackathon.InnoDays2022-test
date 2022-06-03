import { NgModule } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { IonicModule } from "@ionic/angular";

import { GroceryListPage } from "./grocery-list";
import { PopoverPage } from "../about-popover/about-popover";
import { GroceryListPageRoutingModule } from "./grocery-list-routing.module";

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    GroceryListPageRoutingModule,
  ],
  declarations: [GroceryListPage],
  // entryComponents: [PopoverPage],
  bootstrap: [GroceryListPage],
})
export class GroceryListModule {}
