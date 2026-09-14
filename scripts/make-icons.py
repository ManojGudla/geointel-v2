"""
Builds the MG monogram, as the standard mark and as the Android maskable one.

The letters are extracted from Poppins Bold and written out as <path> data, so
the finished files have no font dependency at all — a favicon is rasterised by
browsers, crawlers and phone launchers, and not one of them can be relied on
to have the font installed.
"""

from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

FONT = "/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf"
TILE = 512
ICONS = "/home/claude/geointel-v2/public/icons"

font = TTFont(FONT)
cap = font["OS/2"].sCapHeight
glyphs = font.getGlyphSet()
hmtx = font["hmtx"]


def outline(ch):
    name = font.getBestCmap()[ord(ch)]
    pen = SVGPathPen(glyphs)
    glyphs[name].draw(pen)
    return pen.getCommands(), hmtx[name][0]


m_path, m_adv = outline("M")
g_path, g_adv = outline("G")

# Negative tracking, in font units. Poppins' M and G are both wide and open,
# and the default spacing leaves them reading as two separate initials rather
# than as one mark.
TRACKING = -70
CONTENT = m_adv + TRACKING + g_adv

GRADIENT = """    <linearGradient id="{gid}" x1="0.1" y1="0" x2="0.9" y2="1">
      <stop offset="0" stop-color="#1d3f77"/>
      <stop offset="0.52" stop-color="#12294f"/>
      <stop offset="1" stop-color="#091426"/>
    </linearGradient>"""


def letters(side_padding):
    scale = (TILE - side_padding * 2) / CONTENT
    cap_px = cap * scale
    baseline = TILE / 2 + cap_px / 2
    origin = (TILE - CONTENT * scale) / 2
    block = (
        f'  <g transform="translate({origin:.2f} {baseline:.2f}) scale({scale:.5f} -{scale:.5f})">\n'
        f'    <path d="{m_path}" fill="#eef3fc"/>\n'
        f'    <g transform="translate({m_adv + TRACKING} 0)">\n'
        f'      <path d="{g_path}" fill="#ff9440"/>\n'
        f"    </g>\n"
        f"  </g>\n"
    )
    return block, cap_px


standard, cap_std = letters(46)
# A maskable icon's safe zone is the central circle of 80% diameter, so the
# letters are set smaller here — a launcher may crop to a circle, a squircle
# or a teardrop, and anything outside that circle can be shaved off.
mask, cap_mask = letters(132)

NOTE = """  <!--
    The MG monogram.

    Letters are Poppins Bold converted to outlines rather than set as <text>:
    this file is rasterised by browsers, crawlers and phone launchers, and not
    one of them can be relied on to have the font.

    Two colours, and that is the point rather than decoration. An all-white
    "MG" on a blue tile is precisely what Google draws for a site whose icon
    it cannot find — so a mark that looked like that would be indistinguishable
    from having no mark at all. The amber G is the one accent this brand
    spends, and it gives the tile a colour signature that survives at 16px,
    well past the size where the letterforms stop being legible.

    Sized against the size it is actually seen at. A favicon in a search result
    is 16 pixels: the cap height here is {pct:.0f}% of the tile, which is
    {px:.1f}px at that size, and the stroke weights of Poppins Bold hold up at
    it. The previous mark drew a ring at a 15/512 stroke — 0.47px at 16px —
    which did not thin, it smeared.
  -->"""

with open(f"{ICONS}/mark.svg", "w") as f:
    f.write(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {TILE} {TILE}" width="{TILE}" height="{TILE}" role="img" aria-label="maNOWj GeoIntel">\n'
        + NOTE.format(pct=cap_std / TILE * 100, px=cap_std / TILE * 16)
        + "\n  <defs>\n"
        + GRADIENT.format(gid="tile")
        + "\n  </defs>\n\n"
        + f'  <rect width="{TILE}" height="{TILE}" rx="114" fill="url(#tile)"/>\n'
        + f'  <rect x="2" y="2" width="{TILE - 4}" height="{TILE - 4}" rx="112" fill="none" stroke="#ffffff" stroke-opacity="0.12" stroke-width="4"/>\n\n'
        + standard
        + "</svg>\n"
    )

with open(f"{ICONS}/mark-maskable.svg", "w") as f:
    f.write(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {TILE} {TILE}" width="{TILE}" height="{TILE}" role="img" aria-label="maNOWj GeoIntel">\n'
        "  <!--\n"
        "    The maskable variant, for Android home screens.\n\n"
        "    Full-bleed square with no corner radius, because the launcher applies\n"
        "    its own mask and a pre-rounded tile inside one leaves corner gaps. The\n"
        "    letters are set smaller so they stay inside the safe zone — the central\n"
        "    circle of 80% diameter — whatever shape the phone crops to.\n"
        "  -->\n"
        "  <defs>\n" + GRADIENT.format(gid="tileMask") + "\n  </defs>\n\n"
        f'  <rect width="{TILE}" height="{TILE}" fill="url(#tileMask)"/>\n\n' + mask + "</svg>\n"
    )

print(f"standard: cap {cap_std:.1f}px ({cap_std / TILE * 100:.1f}% of tile) -> {cap_std / TILE * 16:.2f}px at 16px")
print(f"maskable: cap {cap_mask:.1f}px ({cap_mask / TILE * 100:.1f}% of tile)")
print("wrote mark.svg and mark-maskable.svg")
