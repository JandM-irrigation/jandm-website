/* Live Google reviews for the home page, served at /api/reviews.
   Asks Google's Places API for the business's rating and its most relevant reviews (Google
   returns up to five), so new reviews show up on the site without anyone editing it.

   Needs two environment variables in Netlify (Site configuration → Environment variables):
     GOOGLE_PLACES_API_KEY  a Google Cloud API key with "Places API (New)" enabled
     GOOGLE_PLACE_ID        the Place ID of the Google Business Profile
   Until both are set this answers 503 and the page keeps the reviews from content/site.json. */

const FIELDS = "displayName,rating,userRatingCount,googleMapsUri,reviews";
const CACHE_SECONDS = 6 * 60 * 60; // Netlify's CDN reuses one answer for 6 hours

function json(body, status, cache) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Netlify-CDN-Cache-Control": cache ? `public, max-age=${CACHE_SECONDS}` : "no-store",
    },
  });
}

export default async () => {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;
  if (!key || !placeId) return json({ error: "Google reviews are not set up" }, 503, false);

  let place;
  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=en`, {
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELDS },
    });
    if (!res.ok) return json({ error: `Google answered ${res.status}` }, 502, false);
    place = await res.json();
  } catch {
    return json({ error: "Could not reach Google" }, 502, false);
  }

  // Same shape as the reviews in content/site.json, so the page renders both the same way
  const reviews = (place.reviews || [])
    .filter((r) => r.text && r.text.text)
    .map((r) => ({
      name: r.authorAttribution?.displayName || "Google user",
      url: r.googleMapsUri || r.authorAttribution?.uri || "",
      when: r.relativePublishTimeDescription || "",
      rating: r.rating,
      text: r.text.text,
    }));

  return json({
    business: place.displayName?.text || "",
    rating: place.rating || null,
    count: place.userRatingCount || 0,
    url: place.googleMapsUri || "",
    reviews,
  }, 200, true);
};

export const config = { path: "/api/reviews" };
