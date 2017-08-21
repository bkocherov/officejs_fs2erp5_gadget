/*globals window, RSVP, rJS, loopEventListener, URL, document
 FileReader, console, navigator, jIO */
/*jslint indent: 2, nomen: true, maxlen: 80*/
(function (window, navigator, RSVP, rJS, jIO, URL) {
	"use strict";

	var origin_url = (window.location.origin + window.location.pathname)
		.replace("officejs_fs2erp5_gadget/", "");
			// application_list = [
			// 	"officejs_fs2erp5_gadget",
			//
			// ];

	function exportZip(gadget, event) {
		var j,
			zip_name,
			// i = 0,
			form_result = {},
			len = event.target.length,
			app_url;

		for (j = 0; j < len; j += 1) {
			form_result[event.target[j].name] = event.target[j].value;
		}
		app_url = origin_url + form_result.web_site + '/';
		// len = 0;
		zip_name = form_result.filename;

		// function fill(zip_file) {
		// 	if (i < len) {
		// 		var sub_app = app.sub_gadget[i];
		// 		return gadget.fillZip({
		// 			cache: "erp5_/index.appcache",
		// 			site_url: origin_url + app.url,
		// 			zip_file: zip_file,
		// 			prefix: sub_app + "/",
		// 			take_installer: false
		// 		})
		// 			.push(function (zip_file) {
		// 				i += 1;
		// 				return fill(zip_file);
		// 			});
		// 	}
		// 	return zip_file;
		// }
		//
		return new RSVP.Queue()
			.push(function () {
				return jIO.util.ajax({
					type: "GET",
					dataType: "json",
					url: app_url + "erp5_/erp5.json"
				});
			})
			.push(function (response) {
				gadget.props.erp5_options = response.target.response;
			})
			.push(function () {
				return gadget.fillZip({
					cache: "erp5_/index.appcache",
					site_url: app_url,
					take_installer: false
				});
			})
			// .push(function (zip_file) {
			// 	return fill(zip_file);
			// })
			.push(function (zip_file) {
				var element = gadget.props.element,
					a = document.createElement("a"),
					url = URL.createObjectURL(zip_file),
					default_name = gadget.props.erp5_options.name
						.replace(' ', '_');
				element.appendChild(a);
				a.style = "display: none";
				a.href = url;
				a.download = zip_name ? zip_name : default_name + ".zip";
				a.click();
				element.removeChild(a);
				URL.revokeObjectURL(url);
			});
	}

	rJS(window)
		.ready(function (g) {
			g.props = {};
			return g.getElement()
				.push(function (element) {
					g.props.element = element;
				});
		})
		.declareMethod("fillZip", function (options) {
			var gadget = this,
				file_storage = jIO.createJIO({
					type: "replicate",
					conflict_handling: 2,
					check_remote_attachment_creation: true,
					check_local_creation: false,
					check_local_modification: false,
					check_local_deletion: false,
					check_remote_deletion: false,
					check_remote_modification: false,
					remote_sub_storage: {
						type: "fs2erp5",
						document: options.site_url,
						sub_storage: {
							type: "appcache",
							take_installer: options.take_installer,
							manifest: options.cache,
							origin_url: options.site_url,
							prefix: options.prefix || ""
						}
					},
					signature_sub_storage: {
						type: "query",
						sub_storage: {
							type: "memory"
						}
					},
					local_sub_storage: {
						type: "zipfile",
						file: options.zip_file
					}
				});
			return file_storage.repair()
				.push(function () {
					return file_storage.getAttachment('/', '/');
				});
		})

		/////////////////////////////////////////
		// Form submit
		/////////////////////////////////////////
		.declareService(function () {
			var gadget = this;
			return new RSVP.Queue()
				.push(function () {
					return loopEventListener(
						gadget.props.element.querySelector('form.export-form'),
						'submit',
						true,
						function (event) {
							return exportZip(gadget, event);
						}
					);
				});
		});

}(window, navigator, RSVP, rJS, jIO, URL));