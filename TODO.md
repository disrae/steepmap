# Steepmap to-do

## Next
- [ ] **Sharp satellite we can keep offline.** Esri's terms don't allow offline use outside its own apps, so it can only be the online layer. Candidates:
  - BC 2009 orthophoto mosaics: 50 cm Sea to Sky, 10 cm Whistler, 20 cm Squamish. Licence is "Access Only", so ask GeoBC for written permission first.
  - District of North Vancouver 2013: 10 cm, open licence, covers the North Shore mountains. It's distributed as ECW, which needs GDAL with ECW support to convert.
  - Paid archive imagery: Pléiades/WorldView 50 cm, about $12–15 per km², so only for small priority zones.
- [ ] Sharper elevation: LidarBC 1 m DEM (OGL-BC, about 60% of Sea to Sky), filled with NRCan MRDEM-30.

## Phone app (Capacitor wrapping `web/`)
- [ ] Background GPS hike tracking: record with the screen off, live distance and elevation, save as a route or GPX
- [ ] Offline areas stored in app storage so the system never clears them
- [ ] Android build to share directly; iPhone through TestFlight (needs an Apple Developer account)

## Map
- [ ] Winter map polish: show rock on steep slopes (from the slope tiles) and add tree texture. Land cover from OpenStreetMap is patchy in places; ESA WorldCover could fill the gaps.
- [ ] Snap routes to trails while planning
- [ ] Snowmobile trails from BC Recreation Sites and Trails (Open Government Licence BC): Brohm Ridge, Brandywine, Rutherford, Sproatt. Useful to know about on winter tours
- [ ] Avalanche terrain ratings (ATES) for known trips, if a source with a usable licence turns up
- [ ] More regions (Rogers Pass, the Rockies, Washington): a line in `tiles/regions.txt` and `web/regions.json`, then build and upload
