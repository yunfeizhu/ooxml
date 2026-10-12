import '@angular/compiler';
import { Component, ViewChild, type AfterViewInit } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { VisioViewerComponent } from '../../../viewers/visio/packages/bindings/src/angular';
import { createWorkspace } from '../demo/workspace';

// The Angular demo: <visio-viewer-host> with inputs, a @ViewChild handle and change detection.
const workspace = createWorkspace();

@Component({
	selector: 'visio-demo-app',
	standalone: true,
	imports: [VisioViewerComponent],
	template:
		'<visio-viewer-host [document]="document" [events]="events" aria-label="Visio diagram"></visio-viewer-host>',
})
class AppComponent implements AfterViewInit {
	@ViewChild(VisioViewerComponent) viewer?: VisioViewerComponent;
	document = workspace.initialDocument;
	readonly events = workspace.events;
	ngAfterViewInit(): void {
		if (!this.viewer) return;
		workspace.attach(this.viewer);
	}
}

const host = window.document.getElementById('viewer')!;
host.append(window.document.createElement('visio-demo-app'));
void bootstrapApplication(AppComponent);
