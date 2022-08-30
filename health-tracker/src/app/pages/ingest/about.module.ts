import { NgModule } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { IonicModule } from "@ionic/angular";
import { WebcamModule } from "ngx-webcam";

import { IngestPage } from "./about";
import { IngestPageRoutingModule } from "./about-routing.module";

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    IngestPageRoutingModule,
    WebcamModule,
  ],
  declarations: [IngestPage],
  bootstrap: [IngestPage],
})
export class IngestModule {}
