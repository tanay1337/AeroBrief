# Third-party notices

The root MIT license covers original AeroBrief code and original project artwork. Preserve upstream copyright/license statements, including those inside generated JavaScript strings.

## Code redistributed in this repository

| Component | Version | Location | License |
| --- | --- | --- | --- |
| [Leaflet](https://github.com/Leaflet/Leaflet) | 1.9.4 | `src/vendor/leafletScripts.generated.ts` | BSD-2-Clause; full text in `LICENSES/leaflet/LICENSE` |
| [PDF.js](https://github.com/mozilla/pdf.js) | 3.11.174 | `src/vendor/pdfjsScripts.generated.ts` | Apache-2.0; full text in `LICENSES/pdfjs-dist/LICENSE`; retain embedded worker dependency notices |

These files wrap upstream distributions as TypeScript strings. Their generator scripts preserve original notice headers. Include the licenses when distributing copies or binaries that embed them. Retain applicable NOTICE files when upgrading dependencies.

## Installed dependencies

`LICENSES/direct-dependencies.json` records exact versions and copied license files for direct production/development dependencies. `LICENSES/lockfile-inventory.json` records declared licenses for the full lockfile, including nested, optional, and development packages. These are metadata inventories, not legal clearance or proof that each package is included in a binary.

Original authors' copyright statements, names, and public contact details in upstream notices are intentional. Do not remove them as private-data cleanup.

SunCalc 1.9.0 includes a BSD-2-Clause license at `LICENSES/suncalc/LICENSE`, although its lockfile metadata omits a license. Transitive license obligations, dual-license choices, and MPL-2.0 files must be handled according to their actual terms if code is redistributed or modified. A dual license does not automatically require choosing its copyleft option.

## Fonts and icons

The UI imports Ionicons through `@expo/vector-icons`. MIT notices for the Expo wrapper and its included `react-native-vector-icons` wrapper are copied under `LICENSES/`. Wrapper licenses alone do not cover every available font family. [Ionicons](https://github.com/ionic-team/ionicons) is MIT licensed; preserve its notice when distributing its font/glyph artwork.

No third-party font binary is committed here. For an APK release, inventory the font assets actually exported and include each family's applicable license, including families made available through dependencies.

## Data and services

The bundled database derives from [OurAirports public-domain exports](https://ourairports.com/data/), with provenance retained and no fitness or accuracy guarantee. Other provider content is fetched or linked at runtime and is not relicensed under MIT. See the data and providers section in README.md.
