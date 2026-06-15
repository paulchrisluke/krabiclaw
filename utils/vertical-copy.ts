export type SiteVertical =
  | "restaurant"
  | "experience";

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
    experiencesPageTitle: "Experiences",
    experiencesPageSubtitle:
      "Classes, special dinners, and bookable nights beyond the usual table reservation.",
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
    seoExperiencesDescription: (name: string) =>
      `Explore classes, tasting nights, and bookable experiences at ${name}.`,
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
    experiencesPageTitle: "Experiences",
    experiencesPageSubtitle:
      "Classes, workshops, and special sessions you can book right now.",
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
    seoExperiencesDescription: (name: string) =>
      `Browse classes and bookable experiences at ${name}.`,
  },
} as const satisfies Record<SiteVertical, object>;

export function getVerticalCopy(vertical: string | null | undefined) {
  const v = String(vertical ?? "restaurant");
  if (Object.prototype.hasOwnProperty.call(registry, v)) {
    return registry[v as SiteVertical];
  }
  return registry.restaurant;
}
