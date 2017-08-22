/*jslint indent:2, maxlen: 80, nomen: true */
/*global jIO, RSVP, window, console, Blob */
(function (window, jIO, RSVP, console, Blob) {
  "use strict";

  function Fs2Erp5Storage(spec) {
    this._document = spec.document;
    this._sub_storage = jIO.createJIO(spec.sub_storage);
    this._id_dict = {};
    this._paths = {};
  }

  Fs2Erp5Storage.prototype.get = function (url) {
    return {};
  };

  Fs2Erp5Storage.prototype.hasCapacity = function (name) {
    return (name === "list");
  };

  Fs2Erp5Storage.prototype.getAttachment = function (doc_id, attachment_id) {
	  // doc_id + ((attachment_id === "index.html") ?
    //  (doc_id.endsWith("imagelib/") ? "index.html" : "") : attachment_id)
    return this._sub_storage.getAttachment(
      this._document, this._id_dict[doc_id][attachment_id]
    );
  };

  Fs2Erp5Storage.prototype.allAttachments = function (doc_id) {
    return this._id_dict[doc_id] || {};
  };

  Fs2Erp5Storage.prototype.buildQuery = function (options) {
	  var id, result = [], context = this;
	  for (id in context._id_dict) {
		  if (context._id_dict.hasOwnProperty(id)) {
			  result.push({id: id});
		  }
	  }
	  return result;
  };

  Fs2Erp5Storage.prototype.repair = function () {
    // Transform id attachment ( file path ) to id list / attachments
    var context = this;
    return context._sub_storage.repair()
      .push(function () {
	      return jIO.util.ajax({
		      type: "GET",
		      dataType: "json",
		      url: context._document + "erp5_/erp5.json"
	      });
      })
	    .push(function (response) {
	    	var scopes, i, x, scope;
		    context._options = response.target.response;
		    scopes = context._options.scopes;
		    for (i = 0; i < scopes.length; i += 1) {
		    	scope = scopes[i];
		    	for (x = 0; x < scope.paths.length; x += 1) {
				    context._paths[scope.paths[x]] = scope;
			    }
		    }
	    })
      .push(function () {
        return context._sub_storage.allAttachments(context._document);
      })
      .push(function (result) {
        var id, path, last_index, filename, filename_xml, ext, new_id, i;
        for (id in result) {
	        if (
	        	result.hasOwnProperty(id) &&
		        !id.startsWith("http") &&
		        !id.startsWith("/erp5_/") && //rmove meta of package
		        !id.startsWith("/assets/") // remove github added assets
	        ) {
            last_index = id.lastIndexOf("/") + 1;
            if (last_index === id.length) {
              path = id || "/";
              filename = "index.html";
            } else {
              path = id.substring(0, last_index);
              filename = id.substring(last_index);
            }
            new_id = path + filename;
            ext = filename.substring(filename.lastIndexOf('.') + 1);
            switch (ext) {
	            case "js":
		            path = "/PathTemplateItem/web_page_module/";
		            break;
	            case "ttf":
		            path = "/PathTemplateItem/document_module/";
		            ext = "bin";
		            break;
              default:
                continue;
            }
            for (i in context._paths) {
            	if (new_id.startsWith(i)) {
            		if (context._paths[i].prefix) {
            			new_id = context._paths[i].prefix + "/" + new_id;
		            }
	            }
            }
		        filename = new_id.split("/")
				        .join("_").split(".").join("_") + '.' + ext;
		        filename_xml = new_id.split("/")
				        .join("_").split(".").join("_") + '.xml';
            if (!context._id_dict.hasOwnProperty(path)) {
              context._id_dict[path] = {};
            }
		        context._id_dict[path][filename] = id;
		        context._id_dict[path][filename_xml] = id;
          }
        }
      });
  };

  jIO.addStorage('fs2erp5', Fs2Erp5Storage);
}(window, jIO, RSVP, console, Blob));