# Steepmap to-do

## Next
- [ ] **Offline areas**: draw a box, see the estimated download size, download with progress, list and delete saved areas, and ask the browser to keep the storage permanently (`navigator.storage.persist()`)
- [ ] **Custom domain** on the `steepmap` Worker
- [ ] **Rename the GitHub repo** from `FATMAP` to `steepmap` (it's public)

## Phone app (Capacitor wrapping `web/`)
- [ ] Background GPS hike tracking: record with the screen off, live distance and elevation, save as a route or GPX
- [ ] Offline areas stored in app storage so the system never clears them
- [ ] Android build to share directly; iPhone through TestFlight (needs an Apple Developer account)

## Map
- [ ] **Better Winter map.** Right now it's flat white relief with no trees. It should look like satellite in winter:
  - Option A: satellite imagery with snow drawn on open, high terrain. Use elevation and slope to whiten alpine areas and leave forest dark green.
  - Option B: winter look from land cover. White ground, forest from ESA WorldCover drawn as dark texture, rock on steep slopes, then hillshade.
  - FATMAP's winter map was roughly B. Satellite photos taken in winter are rare and patchy, so a styled look tends to beat real winter imagery.
- [ ] Snap routes to trails while planning
- [ ] More trail regions (whole BC, the Rockies, Washington); trail files over 25 MB move to Cloudflare R2
