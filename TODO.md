# Steepmap to-do

## Next
- [ ] **Sharp satellite we can keep offline.** Esri's terms don't allow offline use outside its own apps, so it can only be the online layer. Candidates:
  - BC 2009 orthophoto mosaics: 50 cm Sea to Sky, 10 cm Whistler, 20 cm Squamish. Licence is "Access Only", so ask GeoBC for written permission first.
  - District of North Vancouver 2013: 10 cm, open licence, covers the North Shore mountains. It's distributed as ECW, which needs GDAL with ECW support to convert.
  - Paid archive imagery: Pléiades/WorldView 50 cm, about $12–15 per km², so only for small priority zones.
- [ ] Sharper elevation: LidarBC 1 m DEM (OGL-BC, about 60% of Sea to Sky), filled with NRCan MRDEM-30.

## Phone app (`mobile/`, Capacitor)
- [x] Background GPS hike tracking (tested on the Android emulator: keeps recording with the app in the background)
- [ ] iPhone: accept the Xcode licence, set the signing team, run on a phone, then TestFlight for friends
- [ ] Android: a signed release build to share, or the Play Store
- [ ] Ask for notification permission on Android 13+ so the "Recording" notice always shows
- [ ] Live stats on the lock screen while recording

## Hike tracking
- [ ] Follow a planned route while recording, with distance to go and off-route warnings
- [ ] Share a recording with friends (GPX now; a share link later would need a small server)
- [ ] Photos and notes along a track

## Map
- [ ] Winter map polish: show rock on steep slopes (from the slope tiles) and add tree texture. Land cover from OpenStreetMap is patchy in places; ESA WorldCover could fill the gaps.
- [ ] Snap routes to trails while planning
- [ ] Snowmobile trails from BC Recreation Sites and Trails (Open Government Licence BC): Brohm Ridge, Brandywine, Rutherford, Sproatt. Useful to know about on winter tours
- [ ] Avalanche terrain ratings (ATES) for known trips, if a source with a usable licence turns up
- [ ] More regions (Rogers Pass, the Rockies, Washington): a line in `tiles/regions.txt` and `web/regions.json`, then build and upload
