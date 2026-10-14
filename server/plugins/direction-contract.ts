// Design contract of the terminal UI, emitted as the first node of <body> so it survives the build.
const CONTRACT = `<!--
THESIS: The terminal is a printed warehouse label, not an admin panel: every screen is one bold label to read at arm's length; it refuses cards, soft shadows and colour.
OWN-WORLD: Thermal paper white, print black, 3px die-cut frames, condensed heavy caps (Roboto Flex wdth 40) and big tabular numerals; state by inversion, diagonal hatch (pending), cross-hatch (attention), dashed frame (unavailable).
STORY: Staff scan equipment, see where it is and how many, scan or pick a shelf, read the exact outcome, confirm, and get a fresh label back.
FIRST VIEWPORT: Black rail; a 6xl caps instruction; an 80px framed search field with Find and Camera; three numbered step labels. Primary action is the field itself — the scanner.
FORM: Warehouse thermal label, rank 1 of 7; seed a32d1f30.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
-->`

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('render:html', (html) => {
    html.bodyPrepend.unshift(CONTRACT)
  })
})
