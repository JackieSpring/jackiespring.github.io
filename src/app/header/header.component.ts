import { Component } from "@angular/core";




@Component({
    selector: 'app-header',
    standalone: true,
    template: `<div>
        <h1>{{title}}</h1>
    </div>`
})
export class HeaderComponent {
    title = "APP HEASDDER"
}

