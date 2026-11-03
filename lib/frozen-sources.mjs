// Retained immutable storage objects verified through the storage catalog.
export const frozenSources=[
 ['refresh-1793651508223-7b8255e1-2e14-40f3-8d3b-22d165d37e33','2026-11-02T20:31:50.262Z'],
 ['refresh-1793653728182-95b85725-048b-4b36-aa3a-b85a0cf2c5ea','2026-11-02T21:08:51.181Z'],
 ['refresh-1793653759920-3b22d253-04a2-40a4-a4f0-613be4853522','2026-11-02T21:09:22.187Z'],
 ['refresh-1793653813998-0468bed0-ba8a-4f7f-8f0a-e51e500c3f1c','2026-11-02T21:10:17.149Z'],
 ['refresh-1793653847312-8493b088-cf7e-445f-8cbb-dab8a264516c','2026-11-02T21:10:49.975Z'],
 ['refresh-1793654410319-f1d24bd4-d3d6-4322-abd1-12aba691a440','2026-11-02T21:20:12.640Z'],
 ['refresh-1793655010697-3850beb1-cae7-4604-8a32-599e36f8061e','2026-11-02T21:30:13.664Z'],
 ['refresh-1793655616162-5956e02d-f9d2-4984-bf54-de887cb1836c','2026-11-02T21:40:18.960Z']
].map(([id,savedAt])=>({path:`imports/${id}/daily-picks.json.gz`,savedAt}));
