/*jslint indent:2, maxlen: 80, nomen: true */
/*global jIO, RSVP, window, console, Blob,
 jstoxml, base64js */
(function (window, jIO, RSVP, console, Blob, jstoxml, base64js) {
  "use strict";

  var CurrentTimestamp = new Date().getTime() / 1000;

  function string2blob(s) {
    var l = s.length,
      array = new Uint8Array(l);
    for (var i = 0; i < l; i++) {
      array[i] = s.charCodeAt(i);
    }
    return new Blob([array], {type: 'application/octet-stream'});
  }

  function generateZopeData(obj) {
    var records = [], records_count = 1, tasks = [];

    function pickle(obj) {
      var type = typeof obj,
        items = [];
      if (obj === null) {
        type = 'null';
      }
      if (Array.isArray(obj)) {
        type = 'array';
      }
      switch (type) {
        case "null":
          return {none: ""};
        case "string":
          // TODO cdata fix
          obj = obj
            .replace(/\r\n/g, '\\r\\n')
            .replace(/\n/g, '\\n')
            .replace(/\\n/g, '\\n\n');
          // .replace(/</g, '&lt;')
          // .replace(/>/g, '&gt;')
          // .replace(/&/g, '&amp;')
          // .replace(/"/g, '&quot;')
          // .replace(/'/g, '&apos;');
          return {string: obj};
        case "array":
          for (var i = 0; i < obj.length; i += 1) {
            items.push(pickle(obj[i]));
          }
          return {tuple: items};
        case "function":
          return obj();
        case "number":
          return {float: obj};
        case "object":
          if (obj.persistent) {
            return obj;
          }
          for (var key in obj) {
            if (obj.hasOwnProperty(key)) {
              if (key === "workflow_history") {
                items.push({
                  item: {
                    key: {
                      string: key
                    },
                    value: add_workflow_history(obj[key])
                  }
                });
              } else {
                items.push({
                  item: {
                    key: {
                      string: key
                    },
                    value: pickle(obj[key])
                  }
                });
              }
            }
          }
          return {dictionary: items};
        default:
          return obj.toString();
      }
    }

    function pickle_date(timestamp) {
      return function () {
        return {
          object: [
            {
              klass: {
                _name: "global",
                _attrs: {
                  name: "DateTime",
                  module: "DateTime.DateTime"
                }
              }
            },
            pickle([null]),
            {
              state: pickle([
                timestamp,
                "UTC"
              ])
            }
          ]
        };
      };
    }

    function add_workflow_history(obj) {
      return add_record("PersistentMapping", "Persistence.mapping",
        function () {
          var workflows = {};
          Object.keys(obj).forEach(function (key) {
            if (obj.hasOwnProperty(key)) {
              workflows[key] = add_record("WorkflowHistoryList",
                "Products.ERP5Type.patches.WorkflowTool",
                function () {
                  // it cause uncomfortable modifications on update
                  // obj[key].time = pickle_date(CurrentTimestamp);
                  obj[key].actor = "zope";
                  return {
                    tuple: [
                      pickle(null),
                      {list: pickle(obj[key])}
                    ]
                  };
                }
              );
            }
          });
          return pickle({data: workflows});
        });
    }

    function longToByteArray(/*long*/long) {
      // we want to represent the input as a 8-bytes array
      var byteArray = [0, 0, 0, 0, 0, 0, 0, 0];

      for (var index = byteArray.length - 1; index !== 0; index--) {
        var byte;
        /* jshint -W016 */
        byte = long & 0xff;
        byteArray[index] = byte;
        long = (long - byte) / 256;
      }

      return byteArray;
    }

    function add_record(name, module, obj) {
      var id = records_count++,
        base64 = base64js.fromByteArray(longToByteArray(id));
      tasks.push(function () {
        return {
          _name: "record",
          _attrs: {
            id: id,
            aka: base64
          },
          _content: [
            {
              pickle: {
                _name: "global",
                _attrs: {
                  name: name,
                  module: module
                }
              }
            },
            {
              pickle: obj()
            }
          ]
        };
      });
      return {
        persistent: {
          _name: "string",
          _attrs: {encoding: "base64"},
          _content: base64
        }
      };
    }

    if (obj.portal_type) {
      obj._Access_contents_information_Permission = [
        "Anonymous",
        "Assignee",
        "Assignor",
        "Associate",
        "Auditor",
        "Manager",
        "Owner"
      ];
      obj._Add_portal_content_Permission = [
        "Assignor",
        "Manager"
      ];
      obj._Change_local_roles_Permission = [
        "Assignor",
        "Manager"
      ];
      obj._Modify_portal_content_Permission = [
        "Manager"
      ];
      obj._View_Permission = [
        "Anonymous",
        "Assignee",
        "Assignor",
        "Associate",
        "Auditor",
        "Manager",
        "Owner"
      ];
      add_record(obj.portal_type, "erp5.portal_type", function () {
        return pickle(obj);
      });
    } else if (Array.isArray(obj._objects)) {
      add_record("Folder", "OFS.Folder", function () {
        return pickle(obj);
      });
    } else {
      add_record("File", "OFS.Image", function () {
        return pickle(obj);
      });
    }
    while (tasks.length > 0) {
      records.push(tasks.shift()());
    }
    return jstoxml.toXML({
      ZopeData: records
    }, {header: true, indent: '  '});
  }

  function check_excluded(path, excluded_paths) {
    var i;
    for (i = 0; i < excluded_paths.length; i += 1) {
      if (path.startsWith(excluded_paths[i])) {
        return false;
      }
    }
    return true;
  }

  function Fs2Erp5Storage(spec) {
    this._document = spec.document;
    this._sub_storage = jIO.createJIO(spec.sub_storage);
    this._id_dict = {};
    this._paths = {};
  }

  function ModuleGenerator(context, orig_id, id_prefix, web_path, filename) {
    var xmldoc = {}, ext, i, path;
    xmldoc.default_reference = web_path;
    xmldoc.version = context._options.version;
    xmldoc.workflow_history = {
      document_publication_workflow: {
        action: "publish",
        validation_state: "published"
      }
    };
    xmldoc.id = id_prefix + web_path;
    xmldoc.id = xmldoc.id.split("/").join("_").split(".").join("_");

    ext = filename.substring(filename.lastIndexOf('.') + 1);
    // TODO: all filetype support
    switch (ext) {
      case "template":
      case "html":
      case "htm":
        path = "web_page_module";
        xmldoc.portal_type = "Web Page";
        xmldoc.content_type = "text/html";
        break;
      case "js":
        path = "web_page_module";
        xmldoc.portal_type = "Web Script";
        xmldoc.content_type = "text/javascript";
        break;
      case "css":
        path = "web_page_module";
        xmldoc.portal_type = "Web Style";
        xmldoc.content_type = "text/css";
        break;
      case "appcache":
        path = "web_page_module";
        xmldoc.portal_type = "Web Manifest";
        // "text/cache-manifest" not supported in erp5;
        xmldoc.content_type = null;
        xmldoc.text_content = orig_id;
        break;
      case "png":
      case "gif":
      case "jpg":
      case "svg":
        path = "image_module";
        xmldoc.portal_type = "Image";
        xmldoc.title = filename;
        xmldoc.filename = filename;
        switch (ext) {
          case "svg":
            xmldoc.content_type = "image/svg+xml";
            break;
          default:
            xmldoc.content_type = "image/" + ext;
        }
        break;
      case "json":
        xmldoc.content_type = "application/json";
        break;
      case "eot":
        xmldoc.content_type = "application/vnd.ms-fontobject";
        break;
      case "ttf":
        xmldoc.content_type = "font/truetype";
        break;
      case "woff":
        xmldoc.content_type = "application/x-font-woff";
        break;
      case "woff2":
        xmldoc.content_type = "font/woff2";
        break;
      default:
        return;
    }
    if (!xmldoc.portal_type) {
      xmldoc.portal_type = "File";
      path = "document_module";
      xmldoc.title = filename;
    }
    path = path + "/";
    for (i in context._template_path_list) {
      if (context._template_path_list.hasOwnProperty(i) &&
        context._template_path_list_z.indexOf(path + i) < 0) {
        if (i.substring(i.length - 1) === "*") {
          if (xmldoc.id.startsWith(i.substring(0, i.length - 1))) {
            context._template_path_list_z.push(path + i);
          }
        } else {
          if (i === xmldoc.id) {
            context._template_path_list_z.push(path + i);
          }
        }
      }
    }
    path = context.path_prefix_file + path;
    if (!context._id_dict.hasOwnProperty(path)) {
      context._id_dict[path] = {};
    }
    if (!xmldoc.text_content) {
      context._id_dict[path][xmldoc.id + '.' + ext] = orig_id;
    }
    context._id_dict[path][xmldoc.id + '.xml'] = xmldoc;
    return true;
  }

  function PortalSkinFolderGenerator(context, path) {
    var path_arr = path.split('/'),
      i, path_old, id;
    if (path_arr.length > 1) {
      path_old = context.path_prefix_file;
      if (!context._id_dict.hasOwnProperty(path_old)) {
        context._id_dict[path_old] = {};
      }
      for (i=1; i < path_arr.length; i++) {
        path = context.path_prefix_file + path_arr.slice(0, i).join('/') + "/";
        if (!context._id_dict.hasOwnProperty(path)) {
          id = path_arr[i-1];
          context._id_dict[path] = {};
          context._id_dict[path_old][id + ".xml"] = {
            _objects: [],
            id: id,
            title: ""
          };
        }
        path_old = path;
      }

    }
  }

  function PortalSkinGenerator(context, orig_id, id_prefix, web_path, filename) {
    var ext, path, xmldoc = {
      _Cacheable__manager_id: "http_cache",
      __name__: filename,
      precondition: "",
      title: ""
    };
    ext = filename.substring(filename.lastIndexOf('.') + 1);
    // TODO: all filetype support
    switch (ext) {
      case "template":
      case "html":
      case "htm":
        xmldoc.content_type = "text/html";
        break;
      case "js":
        xmldoc.content_type = "text/javascript";
        break;
      case "css":
        xmldoc.content_type = "text/css";
        break;
      case "appcache":
        xmldoc.content_type = "text/cache-manifest";
        xmldoc._Cacheable__manager_id = null;
        break;
      case "png":
      case "gif":
      case "jpg":
      case "svg":
        xmldoc.filename = filename;
        switch (ext) {
          case "svg":
            xmldoc.content_type = "image/svg+xml";
            break;
          default:
            xmldoc.content_type = "image/" + ext;
        }
        break;
      case "json":
        xmldoc.content_type = "application/json";
        break;
      case "eot":
        xmldoc.content_type = "application/vnd.ms-fontobject";
        break;
      case "ttf":
        xmldoc.content_type = "font/truetype";
        break;
      case "woff":
        xmldoc.content_type = "application/x-font-woff";
        break;
      case "woff2":
        xmldoc.content_type = "font/woff2";
        break;
      default:
        xmldoc.content_type = "application/octet-stream";
        ext = "bin";
        return;
    }
    path = web_path.substring(0, web_path.length - filename.length);
    PortalSkinFolderGenerator(context, path);
    path = context.path_prefix_file + path;
    if (!xmldoc.text_content) {
      context._id_dict[path][filename + '.' + ext] = orig_id;
    }
    context._id_dict[path][filename + '.xml'] = xmldoc;
    return true;
  }

  Fs2Erp5Storage.prototype.get = function (url) {
    return {};
  };

  Fs2Erp5Storage.prototype.hasCapacity = function (name) {
    return (name === "list");
  };

  Fs2Erp5Storage.prototype.getAttachment = function (doc_id, attachment_id) {
    var obj = this._id_dict[doc_id][attachment_id],
      type = typeof obj;
    if (obj instanceof Blob) {
      type = "blob";
    }
    switch (type) {
      // case "undefined":
      //   return new Blob();
      case "blob":
        return obj;
      case "object":
        if (obj.text_content) {
          return this._sub_storage.getAttachment(this._document,
            obj.text_content)
            .push(function (blob) {
              return jIO.util.readBlobAsText(blob);
            })
            .push(function (evt) {
              obj.text_content = evt.target.result;
              return string2blob(generateZopeData(obj));
            });
        } else {
          return string2blob(generateZopeData(obj));
        }
        break;
      default:
        return this._sub_storage.getAttachment(this._document, obj);
    }
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
    var context = this,
      bt_folder = {};
    return context._sub_storage.repair()
      .push(function () {
        return jIO.util.ajax({
          type: "GET",
          dataType: "json",
          url: context._document + "erp5_/erp5.json"
        });
      })
      .push(function (response) {
        var scopes, i, x, scope, size = 0,
          path;

        function add_metafile(fname, body) {
          var type = typeof body,
            new_body;
          if (Array.isArray(body)) {
            type = 'array';
          }
          switch (type) {
            case "undefined":
              return;
            case "array":
              new_body = body.join("\n");
              break;
            // case "object":
            //   break;
            default:
              new_body = body;
          }
          bt_folder[fname] = string2blob(new_body);
        }

        context._options = response.target.response;
        context._options.id_prefix = context._options.id_prefix || "";
        context._options.version = context._options.version || "001";
        context._options.appcache = context._options.appcache ||
          context._options.id_prefix + context._options.name;
        context.path_prefix_meta = '/' + context._options.name + '/bt/';
        if (context._options.portal_skin) {
          context.path_prefix_file = '/' + context._options.name +
            '/SkinTemplateItem/portal_skins/';
          PortalSkinFolderGenerator(context, context._options.portal_skin +
            '/');
          context.path_prefix_file = context.path_prefix_file +
            context._options.portal_skin + '/';
          add_metafile("template_skin_id_list", context._options.portal_skin);
        } else {
          context.path_prefix_file = '/' + context._options.name +
            '/PathTemplateItem/';
        }
        context._id_dict[context.path_prefix_meta] = bt_folder;
        context._template_path_list = {};
        context.excluded_paths = context._options.excluded_paths || [];
        scopes = context._options.scopes || {};
        for (i = 0; i < scopes.length; i += 1) {
          size++;
          scope = scopes[i];
          scope.id_prefix = scope.id_prefix || context._options.id_prefix;
          scope.prefix = scope.prefix || "";
          if (scope.excluded_paths) {
            context.excluded_paths =
              context.excluded_paths.concat(scope.excluded_paths);
          }
          for (x = 0; x < scope.paths.length; x += 1) {
            path = scope.paths[x];
            context._paths[path] = scope;

            // prepare to template_path_list generation
            path = scope.prefix + path;
            if (scope.delete_path_part) {
              path = path.replace(scope.delete_path_part, "");
            }
            path = path.split("/").join("_").split(".").join("_");
            if (['_', '.'].indexOf(path[path.length - 1]) >= 0) {
              path = path + "*";
            }
            context._template_path_list[scope.id_prefix + path] = 1;
          }
        }
        if (size === 0) {
          context._template_path_list[context._options.id_prefix + "*"] = 1;
        }
        add_metafile("title", context._options.name);
        add_metafile("version", context._options.version);
        add_metafile("description", context._options.description);
        add_metafile("copyright_list", context._options.authors);
        add_metafile("dependency_list", context._options.dependencies);
        add_metafile("license", context._options.license);
      })
      .push(function () {
        return context._sub_storage.allAttachments(context._document);
      })
      .push(function (result) {
        var id, path, last_index, filename, i, size,
          xmldoc, generated_appcache = [], id_prefix,
          template_path_list;
        context._template_path_list_z = [];
        for (id in result) {
          if (
            result.hasOwnProperty(id) &&
            id !== "/" &&
            !id.startsWith("erp5_/") && //remove meta of package
            !id.startsWith("assets/") && // remove github added assets
            check_excluded(id, context.excluded_paths)
          ) {
            last_index = id.lastIndexOf("/") + 1;
            if (last_index === id.length) {
              path = id || "/";
              filename = "index.html";
            } else {
              path = id.substring(0, last_index);
              filename = id.substring(last_index);
            }

            path = path + filename;
            size = 0;
            id_prefix = "";
            for (i in context._paths) {
              if (context._paths.hasOwnProperty(i)) {
                size++;
                if (path.startsWith(i)) {
                  if (context._paths[i].delete_path_part) {
                    path = path.replace(context._paths[i].delete_path_part, "");
                  }
                  if (context._paths[i].prefix) {
                    path = context._paths[i].prefix + path;
                  }
                  id_prefix = context._paths[i].id_prefix;
                  size = -1;
                  break;
                }
              }
            }
            if (!id_prefix && path === "index.html") {
              continue;
            }
            if (size > 0) {
              continue;
            }

            if (context._options.portal_skin) {
              if (!PortalSkinGenerator(context, id, id_prefix, path, filename)) {
                continue;
              }
            } else {
              if (!ModuleGenerator(context, id, id_prefix, path, filename)) {
                continue;
              }
            }
            generated_appcache.push(path);
          }
        }

        if (context._options.portal_skin) {
          filename = context._options.appcache + '.appcache';
          context._id_dict[context.path_prefix_file]
            [filename + ".appcache"] =
            string2blob("CACHE MANIFEST\nCACHE:\n" +
              "#autogenerated for: " + context._options.name + '\n' +
              generated_appcache.join("\n") + "\nNETWORK:\n*");
          xmldoc = {
            _Cacheable__manager_id: null,
            __name__: filename,
            precondition: "",
            content_type: "text/cache-manifest",
            title: ""
          };
          context._id_dict[context.path_prefix_file]
            [filename + ".xml"] = string2blob(generateZopeData(xmldoc));
        } else {
          template_path_list = context._template_path_list_z;
          // generate appcache as list of all packaged files
          xmldoc = {
            version: context._options.version,
            id: context._options.appcache + "_appcache",
            default_reference: context._options.appcache + '.appcache',
            portal_type: "Web Manifest",
            content_type: null, // "text/cache-manifest
            workflow_history: {
              document_publication_workflow: {
                action: "publish",
                validation_state: "published"
              }
            },
            text_content: "CACHE MANIFEST\nCACHE:\n" +
            "#autogenerated for: " + context._options.name + '\n' +
            generated_appcache.join("\n") + "\nNETWORK:\n*"
          };
          context._id_dict[context.path_prefix_file + "web_page_module/"]
            [xmldoc.id + ".xml"] = string2blob(generateZopeData(xmldoc));
          template_path_list.push("web_page_module/" + xmldoc.id);

          // create template_path_list meta
          template_path_list = string2blob(template_path_list.join("\n"));
          bt_folder.template_path_list = template_path_list;
          bt_folder.template_keep_workflow_path_list = template_path_list;
          bt_folder.template_keep_last_workflow_history_only_path_list =
            template_path_list;
        }

      });
  };

  jIO.addStorage('fs2erp5', Fs2Erp5Storage);
}(window, jIO, RSVP, console, Blob, jstoxml, base64js));