export type SiteVertical =
  | "restaurant"
  | "experience"
  | "retail"
  | "wellness"
  | "service";

const registry = {
  restaurant: {
    poweredByTagline: "restaurant sites that run themselves",
    aboutImageAlt: "About our restaurant",
    ctaTitle: "Come dine with us.",
    ctaRoute: "/reservations",
    contactSubtitle:
      "For a reservation or visit, head to your nearest location — for press, partnerships, catering or anything else, use the form below.",
    contactSubjectCatering: "Catering & events",
    reserveCta: "Reserve a table",
    reservationPageKicker: "Reservations",
    reservationFormTitle: "Make a Reservation",
    reservationRequestButton: "Request Reservation",
    reservationWord: "reservation",
    reservationExploreLabel: "View Menu",
    reservationExploreRoute: "/menu",
    locationGroupLine: (count: number) =>
      `${count} location${count === 1 ? "" : "s"}, one kitchen philosophy.`,
    postsEyebrow: "From the kitchen",
    bookingNotesPlaceholder:
      "Dietary needs, accessibility requests, preferred seating, or celebration notes.",
    contactLocationsByHeading: "Hours, address, phone — for each room.",
    contactLocationsByNote:
      'For full parking, accessibility and policy details, follow the "Plan a visit" link on each card.',
    otherLocationsHeading: "Sister rooms",
    highlightsSectionHeading: "Posts, reviews & dishes from across the brand.",
    seoReservationDescription: (name: string) => `Reserve a table at ${name}.`,
    featuredEyebrow: "Our Kitchen",
    featuredHeading: "Featured dishes",
    featuredSubtitle: "Thoughtfully crafted. Beautifully served.",
    featuredViewAll: "View full menu",
  },
  experience: {
    poweredByTagline: "experience booking sites that run themselves",
    aboutImageAlt: "About our studio",
    ctaTitle: "Book a class.",
    ctaRoute: "/experiences",
    contactSubtitle:
      "For booking a class or checking availability, head to your nearest studio — for press, partnerships, workshops or anything else, use the form below.",
    contactSubjectCatering: "Workshops & events",
    reserveCta: "Book a class",
    reservationPageKicker: "Bookings",
    reservationFormTitle: "Make a Booking",
    reservationRequestButton: "Request Booking",
    reservationWord: "booking",
    reservationExploreLabel: "View Experiences",
    reservationExploreRoute: "/experiences",
    locationGroupLine: (count: number) =>
      `${count} location${count === 1 ? "" : "s"}, one hands-on experience.`,
    postsEyebrow: "From the studio",
    bookingNotesPlaceholder:
      "Accessibility requests, group details, or other notes.",
    contactLocationsByHeading: "Hours, address, phone — for each studio.",
    contactLocationsByNote:
      'For full parking, accessibility and booking policies, follow the "Plan a visit" link on each card.',
    otherLocationsHeading: "Other spaces",
    highlightsSectionHeading: "Posts, reviews & classes from across the studio.",
    seoReservationDescription: (name: string) => `Book a class at ${name}.`,
    featuredEyebrow: "What we offer",
    featuredHeading: "Featured experiences",
    featuredSubtitle: "Something to discover and remember.",
    featuredViewAll: "View all experiences",
  },
  retail: {
    poweredByTagline: "retail sites that run themselves",
    aboutImageAlt: "About our shop",
    ctaTitle: "Come visit us.",
    ctaRoute: "/locations",
    contactSubtitle:
      "For a visit or product question, head to your nearest location — for press, partnerships, wholesale or anything else, use the form below.",
    contactSubjectCatering: "Events & wholesale",
    reserveCta: "Visit us",
    // The following reservation keys are not relevant for retail; replaced with visit/locations language or disabled
    reservationPageKicker: undefined,
    reservationFormTitle: undefined,
    reservationRequestButton: undefined,
    reservationWord: undefined,
    reservationExploreLabel: "Plan a visit",
    reservationExploreRoute: "/locations",
    locationGroupLine: (count: number) =>
      `${count} location${count === 1 ? "" : "s"}, one shared vision.`,
    postsEyebrow: "From the team",
    bookingNotesPlaceholder:
      "Accessibility requests, group details, or other notes.",
    contactLocationsByHeading: "Hours, address, phone — for each location.",
    contactLocationsByNote:
      'For full parking, accessibility and policy details, follow the "Plan a visit" link on each card.',
    otherLocationsHeading: "Other locations",
    highlightsSectionHeading: "Posts, reviews & picks from across the brand.",
    seoReservationDescription: (name: string) => `Visit ${name}.`,
    featuredEyebrow: "Our Collection",
    featuredHeading: "Featured picks",
    featuredSubtitle: "Curated with care. Ready to take home.",
    featuredViewAll: "Browse the collection",
  },
  wellness: {
    poweredByTagline: "wellness sites that run themselves",
    aboutImageAlt: "About our studio",
    ctaTitle: "Book a session.",
    ctaRoute: "/reservations",
    contactSubtitle:
      "For a session or visit, head to your nearest location — for press, partnerships, corporate bookings or anything else, use the form below.",
    contactSubjectCatering: "Corporate & group bookings",
    reserveCta: "Book a session",
    reservationPageKicker: "Bookings",
    reservationFormTitle: "Make a Booking",
    reservationRequestButton: "Request Booking",
    reservationWord: "booking",
    reservationExploreLabel: "Learn More",
    reservationExploreRoute: "/about",
    locationGroupLine: (count: number) =>
      `${count} location${count === 1 ? "" : "s"}, one wellness philosophy.`,
    postsEyebrow: "From the studio",
    bookingNotesPlaceholder:
      "Health considerations, accessibility needs, or other notes.",
    contactLocationsByHeading: "Hours, address, phone — for each studio.",
    contactLocationsByNote:
      'For full parking, accessibility and booking policies, follow the "Plan a visit" link on each card.',
    otherLocationsHeading: "Other studios",
    highlightsSectionHeading: "Posts, reviews & sessions from across the studio.",
    seoReservationDescription: (name: string) => `Book a session at ${name}.`,
    featuredEyebrow: "What we offer",
    featuredHeading: "Featured sessions",
    featuredSubtitle: "Find your practice. Feel the difference.",
    featuredViewAll: "View all sessions",
  },
  service: {
    poweredByTagline: "service sites that run themselves",
    aboutImageAlt: "About our team",
    ctaTitle: "Book an appointment.",
    ctaRoute: "/reservations",
    contactSubtitle:
      "For a quote or appointment, head to your nearest location — for press, partnerships or anything else, use the form below.",
    contactSubjectCatering: "Corporate & events",
    reserveCta: "Book an appointment",
    reservationPageKicker: "Bookings",
    reservationFormTitle: "Make a Booking",
    reservationRequestButton: "Request Booking",
    reservationWord: "booking",
    reservationExploreLabel: "Learn More",
    reservationExploreRoute: "/about",
    locationGroupLine: (count: number) =>
      `${count} location${count === 1 ? "" : "s"}, one team.`,
    postsEyebrow: "From the team",
    bookingNotesPlaceholder:
      "Details about your request or any special requirements.",
    contactLocationsByHeading: "Hours, address, phone — for each location.",
    contactLocationsByNote:
      'For full parking, accessibility and policy details, follow the "Plan a visit" link on each card.',
    otherLocationsHeading: "Other locations",
    highlightsSectionHeading: "Posts, reviews & work from across the team.",
    seoReservationDescription: (name: string) =>
      `Book an appointment at ${name}.`,
    featuredEyebrow: "What we offer",
    featuredHeading: "Featured services",
    featuredSubtitle: "Expert work. Honest results.",
    featuredViewAll: "View all services",
  },
} as const satisfies Record<SiteVertical, object>;

export function getVerticalCopy(vertical: string | null | undefined) {
  const v = String(vertical ?? "restaurant");
  if (Object.prototype.hasOwnProperty.call(registry, v)) {
    return registry[v as SiteVertical];
  }
  return registry.restaurant;
}
