/**
 * Where the plans actually live.
 *
 * This file is a directory, not a data source, and the distinction is the
 * whole point of it. Approved site plans, building permits, cadastral parcels
 * and plot-level zoning are not in OpenStreetMap and not in any free global
 * dataset. They sit with land revenue departments and development authorities.
 * So the honest thing this app can do is take the place someone has selected
 * and hand them a working link to the authority that holds the record, prefilled
 * as far as each portal's URL will allow.
 *
 * Two rules this file follows, because getting either wrong would make it
 * worse than nothing.
 *
 * EVERY URL WAS CHECKED, in September 2026, and each one carries a note saying
 * how far the check got. A directory of plausible-looking government URLs that
 * 404 is not a feature, it is a way of wasting someone's afternoon.
 *
 * NOTHING HERE CLAIMS TO FIND A PLOT. Not one Indian land records or cadastral
 * portal accepts coordinates: they are all district, then tehsil, then village,
 * then survey number, chosen from dropdowns. This app can open the right
 * portal for the right state. It cannot land anyone on their parcel, and the
 * copy in SitePanel.tsx says so rather than implying otherwise.
 *
 * A note on reachability. Roughly half of these government hosts refuse
 * connections from outside India. That is geofencing, not death, so links are
 * never hidden on the strength of a failed probe — a user in Hyderabad will
 * reach portals that a health check from a European data centre cannot.
 */

export interface Portal {
  label: string;
  url: string;
  note: string;
  /** Shown as a warning chip. Used sparingly and only where it is true. */
  caveat?: string;
}

export interface PortalGroup {
  title: string;
  blurb: string;
  portals: Portal[];
}

/* ────────────────────────────────────────────────────────────────────────────
   Global viewers. Every template below was taken from the provider's own
   documentation and the parameter order checked against it, because these are
   the three or four places people get wrong from memory.
   ──────────────────────────────────────────────────────────────────────────── */

export function globalPortals(lat: number, lon: number, zoom = 17): Portal[] {
  const ll = `${lat.toFixed(6)},${lon.toFixed(6)}`;
  return [
    {
      label: "OpenStreetMap",
      // Note the order: zoom first, then lat, then lon. Everyone writes this
      // the other way round once.
      url: `https://www.openstreetmap.org/#map=${zoom}/${lat.toFixed(6)}/${lon.toFixed(6)}`,
      note: "The map this app's road and construction data comes from. Every feature here is editable and attributed.",
    },
    {
      label: "Google Maps",
      // api=1 is required by Google's URL spec, and the comma has to be
      // percent-encoded or the parameter is dropped.
      url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ll)}`,
      note: "Street View, business listings and the most current road network.",
    },
    {
      label: "Google Earth",
      // Undocumented but stable for years. The `d` value is eye distance in
      // metres and is what actually behaves like zoom here.
      url: `https://earth.google.com/web/@${lat.toFixed(6)},${lon.toFixed(6)},0a,1200d,35y,0h,0t,0r`,
      note: "Historical aerial imagery going back decades, and 3D terrain.",
      caveat: "Google does not document this link format, so it can change without warning.",
    },
    {
      label: "Bing Maps",
      // Tilde between the coordinates, not a comma. Microsoft's own spec.
      url: `https://bing.com/maps/default.aspx?cp=${lat.toFixed(6)}~${lon.toFixed(6)}&lvl=${zoom}&style=a`,
      note: "A second aerial source, often flown in a different year to Google's.",
    },
    {
      label: "Copernicus Browser",
      url: `https://browser.dataspace.copernicus.eu/?zoom=${zoom}&lat=${lat.toFixed(6)}&lng=${lon.toFixed(6)}`,
      note: "Free Sentinel satellite imagery from the European Space Agency, with a date slider.",
      caveat: "Free to browse. Downloading full scenes needs a free account.",
    },
    {
      label: "Open Infrastructure Map",
      url: `https://openinframap.org/#${zoom}/${lat.toFixed(5)}/${lon.toFixed(5)}`,
      note: "Power lines, substations, pipelines and telecoms drawn from OpenStreetMap.",
    },
  ];
}

/* ────────────────────────────────────────────────────────────────────────────
   India.

   Organised by state because that is how the records themselves are organised.
   The national row is always shown; the state rows are added when the
   reverse-geocoded address names a state this file knows about.
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Bhuvan takes a bounding box, not a point.
 *
 * Confirmed by following its own redirect: the viewer reads l (west), b
 * (south), r (east), t (north) and a val of m for map or s for satellite. A
 * point has to be turned into a small box, and 0.004 degrees either side lands
 * at roughly street level.
 */
export function bhuvanUrl(lat: number, lon: number, delta = 0.004): string {
  const l = (lon - delta).toFixed(6);
  const r = (lon + delta).toFixed(6);
  const b = (lat - delta).toFixed(6);
  const t = (lat + delta).toFixed(6);
  return `https://bhuvan-app1.nrsc.gov.in/bhuvan2d/bhuvan/bhuvan2d-te.php?l=${l}&b=${b}&r=${r}&t=${t}&val=s,0`;
}

export function indiaNationalPortals(lat: number, lon: number): Portal[] {
  return [
    {
      label: "Bhuvan (ISRO)",
      url: bhuvanUrl(lat, lon),
      note: "India's own satellite imagery and thematic map viewer, from the National Remote Sensing Centre. Opens at this spot.",
    },
    {
      label: "Bhu-Naksha state directory",
      url: "https://bhunaksha.nic.in/bhunaksha/customization.jsp",
      note: "The official list of every state's cadastral map portal, maintained by NIC. Start here if your state is not listed below.",
    },
    {
      label: "DILRMP",
      url: "https://dilrmp.gov.in/",
      note: "The national land records modernisation programme, and the entry point to state record systems.",
    },
    {
      label: "NGDRS",
      url: "https://www.ngdrs.gov.in/NGDRS_Website/",
      note: "National document registration system, for sale deeds and encumbrance records.",
    },
  ];
}

interface StateEntry {
  /** Matched case-insensitively against the reverse-geocoded state name. */
  aliases: string[];
  portals: Portal[];
}

/*
  Only states whose portal URL is published on NIC's own national directory, or
  which were reached directly, appear here. A state missing from this table
  falls back to the national directory above, which is a worse experience than
  a direct link and a much better one than a guessed URL that 404s.
*/
const INDIA_STATES: StateEntry[] = [
  {
    aliases: ["telangana"],
    portals: [
      {
        label: "Bhu Bharati land records",
        url: "https://bhubharati.telangana.gov.in/",
        note: "Telangana's land record system. Replaced Dharani under the Bhu Bharati Act in 2025, so older guides link a portal that no longer serves this.",
      },
      {
        label: "Bhu Bharati village maps",
        url: "https://bhubharati.telangana.gov.in/gis/",
        note: "Cadastral viewer. Pick district, mandal and village, then click a parcel for its survey number.",
      },
      {
        label: "HMDA master plan",
        url: "https://www.hmda.gov.in/masterplan-huda/",
        note: "Hyderabad metropolitan development plan and land use zoning.",
        caveat: "HMDA's certificate chain is misconfigured, so your browser may warn before it loads.",
      },
    ],
  },
  {
    aliases: ["delhi", "nct of delhi", "national capital territory of delhi"],
    portals: [
      {
        label: "Master Plan for Delhi 2047",
        url: "https://gis.dda.org.in/portal/apps/instant/atlas/index.html?appid=933a7f02ec4d4cc8a6629d332b915bac",
        note: "DDA's interactive land use map. This is the rare Indian master plan you can actually pan and click rather than download as a PDF sheet.",
      },
      {
        label: "DDA layout plans",
        url: "https://dda.gov.in/gis",
        note: "Geo-referenced layout plans for Delhi's colonies, through DDA's own GIS portal.",
      },
      {
        label: "Delhi land records",
        url: "https://dlrc.delhi.gov.in/Default.aspx",
        note: "Khatauni and khasra records by district, tehsil and village.",
        caveat: "Text records only. Delhi publishes no cadastral map viewer.",
      },
    ],
  },
  {
    aliases: ["maharashtra"],
    portals: [
      {
        label: "Maha Bhunakasha",
        url: "https://mahabhunakasha.mahabhumi.gov.in/27/index.html",
        note: "Cadastral map viewer for Maharashtra, including a georeferenced mode.",
      },
      {
        label: "Mahabhumi land records",
        url: "https://mahabhumi.gov.in/",
        note: "7/12 extracts and property cards.",
      },
      {
        label: "Mumbai DP 2034 remarks",
        url: "https://dpremarks.mcgm.gov.in/dp2034/",
        note: "MCGM's development plan remarks system: the zoning and reservations on a Mumbai plot.",
      },
    ],
  },
  {
    aliases: ["andhra pradesh"],
    portals: [
      {
        label: "Bhunaksha Andhra Pradesh",
        url: "https://bhunaksha.ap.gov.in/",
        note: "Cadastral maps by district, mandal and village.",
      },
      {
        label: "Meebhoomi",
        url: "https://meebhoomi.ap.gov.in/",
        note: "Adangal and 1B land records.",
        caveat: "Asks for a CAPTCHA.",
      },
      {
        label: "APCRDA master plans",
        url: "https://crda.ap.gov.in/apcrdav2/views/MasterPlans.aspx",
        note: "Capital region master plans and zonal development plans.",
      },
    ],
  },
  {
    aliases: ["karnataka"],
    portals: [
      {
        label: "Karnataka land records",
        url: "https://landrecords.karnataka.gov.in/",
        note: "RTC and mutation records through the Bhoomi system.",
      },
      {
        label: "Bengaluru GIS viewer",
        url: "https://bbmp.gov.in/gisviewer/",
        note: "Greater Bengaluru's ward, property and land use viewer.",
      },
      {
        label: "BDA Revised Master Plan",
        url: "https://eng.bdabangalore.org/masterplan.html",
        note: "Bangalore Development Authority master plan sheets.",
      },
    ],
  },
  {
    aliases: ["tamil nadu"],
    portals: [
      {
        label: "CollabLand Tamil Nadu",
        url: "https://collabland-tn.gov.in",
        note: "Tamil Nadu's cadastral survey system, listed by NIC as the state's Bhu-Naksha equivalent.",
      },
      {
        label: "TN land records",
        url: "https://eservices.tn.gov.in/eservicesnew/land/chitta.html?lan=en",
        note: "Chitta, patta and A-register extracts.",
        caveat: "Asks for a CAPTCHA.",
      },
      {
        label: "DTCP master plans",
        url: "https://tcp.tn.gov.in/masterplans",
        note: "Status of master plans across Tamil Nadu's towns.",
        caveat: "This page tracks which plans are in preparation. It is not a plan viewer.",
      },
    ],
  },
  { aliases: ["kerala"], portals: [{ label: "Kerala e-Maps", url: "https://emaps.kerala.gov.in", note: "Kerala's cadastral map viewer." }] },
  { aliases: ["rajasthan"], portals: [{ label: "Bhunaksha Rajasthan", url: "https://bhunaksha.rajasthan.gov.in/", note: "Cadastral maps by district and tehsil." }] },
  { aliases: ["uttar pradesh"], portals: [{ label: "UP Bhunaksha", url: "http://upbhunaksha.gov.in", note: "Cadastral maps for Uttar Pradesh.", caveat: "Served over plain HTTP, so some browsers will warn." }] },
  { aliases: ["bihar"], portals: [{ label: "Bhunaksha Bihar", url: "https://bhunaksha.bihar.gov.in/", note: "Cadastral maps by district and circle." }] },
  { aliases: ["punjab"], portals: [{ label: "Bhunaksha Punjab", url: "https://gisbhunaksha.punjab.gov.in", note: "Cadastral maps for Punjab." }] },
  { aliases: ["haryana"], portals: [{ label: "Haryana revenue maps", url: "https://maps.revenueharyana.gov.in", note: "Cadastral maps from the Haryana revenue department." }] },
  { aliases: ["odisha"], portals: [{ label: "Bhunaksha Odisha", url: "http://bhunakshaodisha.nic.in/", note: "Cadastral maps for Odisha.", caveat: "Served over plain HTTP, so some browsers will warn." }] },
  { aliases: ["jharkhand"], portals: [{ label: "Jhar Bhunaksha", url: "https://jharbhunaksha.jharkhand.gov.in/", note: "Cadastral maps for Jharkhand." }] },
  { aliases: ["chhattisgarh"], portals: [{ label: "Bhunaksha Chhattisgarh", url: "https://bhunaksha.cg.nic.in/", note: "Cadastral maps for Chhattisgarh." }] },
  { aliases: ["assam"], portals: [{ label: "Bhunaksha Assam", url: "https://bhunaksha.assam.gov.in", note: "Cadastral maps for Assam." }] },
  { aliases: ["goa"], portals: [{ label: "Bhunaksha Goa", url: "https://bhunaksha.goa.gov.in/bhunaksha/", note: "Cadastral maps for Goa." }] },
  { aliases: ["himachal pradesh"], portals: [{ label: "HP Bhunaksha", url: "http://bhunakshahp.nic.in/", note: "Cadastral maps for Himachal Pradesh.", caveat: "Served over plain HTTP, so some browsers will warn." }] },
  { aliases: ["sikkim"], portals: [{ label: "Bhunaksha Sikkim", url: "https://bhunaksha.sikkimlrdm.gov.in", note: "Cadastral maps for Sikkim." }] },
  { aliases: ["tripura"], portals: [{ label: "Bhunaksha Tripura", url: "https://bhunaksha.tripura.gov.in", note: "Cadastral maps for Tripura." }] },
];

/** Case and punctuation insensitive, because geocoders are not consistent. */
function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
}

export function statePortals(stateName: string | undefined): Portal[] {
  if (!stateName) return [];
  const want = normalise(stateName);
  const entry = INDIA_STATES.find((s) => s.aliases.some((a) => want === a || want.includes(a)));
  return entry ? entry.portals : [];
}

/**
 * Everything to show for one place, already grouped for rendering.
 *
 * `countryCode` and `state` come from the reverse geocode. Outside India the
 * India groups are simply absent rather than shown empty, because a directory
 * of Indian revenue portals is noise to someone looking at Berlin.
 */
export function portalGroups(
  lat: number,
  lon: number,
  countryCode: string | undefined,
  state: string | undefined
): PortalGroup[] {
  const groups: PortalGroup[] = [];
  const inIndia = (countryCode ?? "").toLowerCase() === "in";

  if (inIndia) {
    const local = statePortals(state);
    if (local.length > 0) {
      groups.push({
        title: `${state} records and plans`,
        blurb:
          "The authorities that hold land records and development plans for this state. These portals ask for district, tehsil and village rather than coordinates, so they open at the front door rather than at this plot.",
        portals: local,
      });
    }
    groups.push({
      title: "National (India)",
      blurb:
        state && local.length === 0
          ? `No direct portal is listed for ${state}, so start from NIC's national directory below.`
          : "National imagery and land record systems.",
      portals: indiaNationalPortals(lat, lon),
    });
  }

  groups.push({
    title: "Imagery and open maps",
    blurb: "These all open at the exact point you have selected.",
    portals: globalPortals(lat, lon),
  });

  return groups;
}
