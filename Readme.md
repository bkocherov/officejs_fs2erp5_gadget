## About
The purpose of this Gadget is export of a git repositories which contain web projects
into ERP5 bt5 format. ERP5 allows to upload this format as business template.

## TODO
1. currently zip is used as exported format, but erp5 bt5 tgz is needed. So repack is needed after export.
1. deploy jekill hosting pages to lab.nexedi.com .

## You can try it
https://bkocherov.github.io/officejs_fs2erp5_gadget/

## Using
to use this Gadget the following steps should be done:
 1. fork current repository and add `names of exported respositories` in index.html
 1. public current repository to GitHub Pages hosting `you can find it in repository settings`
 1. create index template in exported repository [erp5_/index.appcache](erp5_/index.appcache)
 1. create config in exported repository `erp5_/erp5.json` 
 1. public repository branch containing the above files to GitHub Pages.
 1. add repository name to index.html
 1. open gadget page then select repo and press button export
 
## erp5_/erp5.json example:

```json
{
  "name": "erp5_officejs_fs2erp5_gadget",
  "description": "RenderJs gadget allows to export github published repos as bt for import repos into erp5.",
  "version": "001",
  "authors": [
    "Copyright (c) 2017 Nexedi SA"
  ],
  "license": "LGPL3",
  "excluded_paths": [
    "build/"
  ],
  "dependencies": [
    "erp5_officejs_onlyoffice_fonts"
  ],
  "scopes": [
    {
      "prefix": "onlyoffice/",
      "paths": [
        "apps/css.js",
        "apps/documenteditor/main/app/"
      ]
    },
    {
      "prefix": "onlyoffice/",
      "delete_path_part": "deploy/web-apps/",
      "paths" : [
        "deploy/web-apps/apps/common/main/resources/"
      ],
      "excluded_paths": [
        "deploy/web-apps/apps/common/main/resources/img/"
      ]
    }
  ]
}
```

### name
the name of created bt5 package

### dependecies
used to generate erp5 bt5 dependency_list

### id_prefix
if used then id_prefix added to erp5 id of every exported document.
id_prefix will not be added to the path of the document.
id_prefix may be used for different documents having the same path can relate to different erp5 business templates.

### scopes
if option scopes used when only files in scope.paths are used for creating erp5 package.

### scopes.prefix
prefix which will be added to the path (reference) of the document in erp5 
