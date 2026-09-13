export type SiteVertical =
  | "restaurant"
  | "experience"
  | "service";

// The single canonical list of app-level verticals a tenant can be created
// or migrated with. This is the one place that enumerates every supported
// value — server/utils/site-creation.ts's VALID_VERTICALS re-exports this
// rather than redeclaring its own array, and any UI vertical picker should
// import this (or ALL_VERTICALS) instead of hand-writing a local
// 'restaurant' | 'experience' union that silently omits new verticals.
export const ALL_VERTICALS: SiteVertical[] = ["restaurant", "experience", "service"];

type LocaleCode = "en" | "th" | "ja";

type VerticalCopy = {
  poweredByTagline: string
  aboutImageAlt: string
  ctaTitle: string
  ctaRoute: string
  contactSubtitle: string
  contactSubjectCatering: string
  reserveCta: string
  reservationPageKicker: string
  reservationFormTitle: string
  reservationRequestButton: string
  reservationWord: string
  reservationExploreLabel: string
  reservationExploreRoute: string
  experiencesPageTitle: string
  experiencesPageSubtitle: string
  locationGroupLine: (_count: number) => string
  postsEyebrow: string
  bookingNotesPlaceholder: string
  contactLocationsByHeading: string
  contactLocationsByNote: string
  otherLocationsHeading: string
  highlightsSectionHeading: string
  seoReservationDescription: (_name: string) => string
  seoExperiencesDescription: (_name: string) => string
  orderNowCta: string
  viewMenuCta: string
  viewMenuRoute: string
  findUsKicker: string
  visitLocationCta: string
  mainLocationLabel: string
  secondLocationLabel: string
  connectGoogleAddressNote: string
  addSecondLocationNote: string
  connectGoogleCta: string
  latelyKicker: string
  ourStoryKicker: string
  readMoreCta: string
  reviewsKicker: string
  guestReviewsLabel: string
  whatGuestsSayLabel: string
  noReviewsLabel: string
  connectGoogleReviewsCta: string
  allLocationsFilter: string
  aboutHeroTitle: string
  aboutHeroSubtitle: string
  ourStoryTitle: string
  ourJourneyKicker: string
  ourJourneyTitle: string
  onlineOrderingNotAvailable: string
  wedLoveToSeeYou: string
  orderKicker: string
  orderHeroTitle: string
  preferReservation: string
  grabLabel: string
  uberEatsLabel: string
  foodpandaLabel: string
  openNowLabel: string
  closedLabel: string
  mainDiningRoomLabel: string
  connectGoogleLocationsCta: string
  additionalLocationsNote: string
  noExperiencesLabel: string
  soldOutLabel: string
  temporarilyUnavailableLabel: string
  fullyBookedLabel: string
  notScheduledLabel: string
  viewExperienceCta: string
  guestsMaxLabel: string
  durationHourLabel: string
  durationMinuteLabel: string
  nameLabel: string
  namePlaceholder: string
  emailLabel: string
  emailPlaceholder: string
  phoneLabel: string
  phonePlaceholder: string
  dateLabel: string
  pickDayLabel: string
  timeLabel: string
  selectTimeLabel: string
  guestsLabel: string
  selectGuestsLabel: string
  specialRequestsLabel: string
  specialRequestsPlaceholder: string
  guestLabel: string
  guestsLabelPlural: string
  contactInfoHeading: string
  phoneLabelShort: string
  emailLabelShort: string
  reservationPoliciesHeading: string
  goodToKnowKicker: string
  callButtonLabel: string
  contactFormButtonLabel: string
  locationLabel: string
  selectLocationLabel: string
  chooseLocationLabel: string
  oneGuestLabel: string
  seoOrderDescription: (_name: string) => string
  thankYouLabel: (_name: string) => string
  confirmationMessage: (_guests: number | string, _guestLabel: string, _date: string, _time: string) => string
  manageLabel: (_word: string) => string
  cancelAnytimeLabel: string
  callUsLabel: (_phone: string) => string
  makeAnotherLabel: (_word: string) => string
  cancelLabel: (_word: string) => string
}

const registry: Record<LocaleCode, Partial<Record<SiteVertical, VerticalCopy>>> = {
  ja: {},
  en: {
    restaurant: {
      poweredByTagline: "restaurant sites that run themselves",
      aboutImageAlt: "About our restaurant",
      ctaTitle: "Come dine with us.",
      ctaRoute: "/reservations",
      contactSubtitle:
        "For a reservation or visit, head to your nearest location, for press, partnerships, catering or anything else, use the form below.",
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
      locationGroupLine: (_count: number) => {
        const count = _count
        return `${count} location${count === 1 ? "" : "s"}, one kitchen philosophy.`
      },
      postsEyebrow: "From the kitchen",
      bookingNotesPlaceholder:
        "Dietary needs, accessibility requests, preferred seating, or celebration notes.",
      contactLocationsByHeading: "Hours, address, phone, for each room.",
      contactLocationsByNote:
        'For full parking, accessibility and policy details, follow the "Plan a visit" link on each card.',
      otherLocationsHeading: "Sister rooms",
      highlightsSectionHeading: "Posts, reviews & dishes from across the brand.",
      seoReservationDescription: (_name: string) => `Reserve a table at ${_name}.`,
      seoExperiencesDescription: (_name: string) =>
        `Explore classes, tasting nights, and bookable experiences at ${_name}.`,
      orderNowCta: "Order Now",
      viewMenuCta: "View Menu",
      viewMenuRoute: "/menu",
      findUsKicker: "Find us",
      visitLocationCta: "Visit this location →",
      mainLocationLabel: "Main location",
      secondLocationLabel: "Second location",
      connectGoogleAddressNote: "Import your address, hours, ratings, and reviews from Google Places.",
      addSecondLocationNote: "Add a second location once your first is connected.",
      connectGoogleCta: "Import from Google Maps →",
      latelyKicker: "Lately",
      ourStoryKicker: "Our story",
      readMoreCta: "Read more →",
      reviewsKicker: "Reviews",
      guestReviewsLabel: "Guest reviews & ratings.",
      whatGuestsSayLabel: "What your guests say.",
      noReviewsLabel: "No reviews yet.",
      connectGoogleReviewsCta: "Import reviews from Google Places →",
      allLocationsFilter: "All locations",
      aboutHeroTitle: "About us",
      aboutHeroSubtitle: "",
      ourStoryTitle: "Our Story",
      ourJourneyKicker: "The journey",
      ourJourneyTitle: "Our Journey",
      onlineOrderingNotAvailable: "Online ordering not available",
      wedLoveToSeeYou: "We'd love to see you in person.",
      orderKicker: "Order",
      orderHeroTitle: "Order online",
      preferReservation: "Prefer to",
      grabLabel: "Grab",
      uberEatsLabel: "Uber Eats",
      foodpandaLabel: "FoodPanda",
      openNowLabel: "Open now",
      closedLabel: "Closed",
      mainDiningRoomLabel: "Main Dining Room",
      connectGoogleLocationsCta: "Add locations from Google Maps",
      additionalLocationsNote: "Additional locations appear here when added.",
      noExperiencesLabel: "No experiences available right now. Check back soon.",
      soldOutLabel: "Sold Out",
      temporarilyUnavailableLabel: "Temporarily unavailable",
      fullyBookedLabel: "Fully booked",
      notScheduledLabel: "Not currently scheduled",
      viewExperienceCta: "View experience",
      guestsMaxLabel: "guests max",
      durationHourLabel: "hr",
      durationMinuteLabel: "min",
      nameLabel: "Name",
      namePlaceholder: "Your name",
      emailLabel: "Email",
      emailPlaceholder: "you@example.com",
      phoneLabel: "Phone",
      phonePlaceholder: "+66 81 234 5678",
      dateLabel: "Date",
      pickDayLabel: "Pick a day above to continue.",
      timeLabel: "Time",
      selectTimeLabel: "Select a time",
      guestsLabel: "Guests",
      selectGuestsLabel: "Select guests",
      specialRequestsLabel: "Special requests",
      specialRequestsPlaceholder: "Tell us anything that will help us prepare for your visit.",
      guestLabel: "guest",
      guestsLabelPlural: "guests",
      contactInfoHeading: "Contact Information",
      phoneLabelShort: "Phone",
      emailLabelShort: "Email",
      reservationPoliciesHeading: "Reservation Policies",
      goodToKnowKicker: "Good to know",
      callButtonLabel: "Call",
      contactFormButtonLabel: "Contact Form",
      locationLabel: "Location",
      selectLocationLabel: "Select a location",
      chooseLocationLabel: "Please choose a location.",
      oneGuestLabel: "1 Guest",
      seoOrderDescription: (_name: string) => `Order online from ${_name}.`,
      thankYouLabel: (_name: string) => `Thank you, ${_name}!`,
      confirmationMessage: (_guests: number | string, _guestLabel: string, _date: string, _time: string) =>
        `Your reservation for ${_guests} ${_guestLabel} on ${_date} at ${_time} is confirmed.`,
      manageLabel: (_word: string) => `Manage ${_word}`,
      cancelAnytimeLabel: "Changed your plans? Cancel anytime before your visit.",
      callUsLabel: (_phone: string) => `Call us: ${_phone}`,
      makeAnotherLabel: (_word: string) => `Make another ${_word}`,
      cancelLabel: (_word: string) => `Cancel ${_word}`,
    },
    experience: {
      poweredByTagline: "experience booking sites that run themselves",
      aboutImageAlt: "About our studio",
      ctaTitle: "Book a class.",
      ctaRoute: "/experiences",
      contactSubtitle:
        "For booking a class or checking availability, head to your nearest studio, for press, partnerships, workshops or anything else, use the form below.",
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
      locationGroupLine: (_count: number) => {
        const count = _count
        return `${count} location${count === 1 ? "" : "s"}, one hands-on experience.`
      },
      postsEyebrow: "From the studio",
      bookingNotesPlaceholder:
        "Accessibility requests, group details, or other notes.",
      contactLocationsByHeading: "Hours, address, phone, for each studio.",
      contactLocationsByNote:
        'For full parking, accessibility and booking policies, follow the "Plan a visit" link on each card.',
      otherLocationsHeading: "Other spaces",
      highlightsSectionHeading: "Posts, reviews & classes from across the studio.",
      seoReservationDescription: (_name: string) => `Book a class at ${_name}.`,
      seoExperiencesDescription: (_name: string) =>
        `Browse classes and bookable experiences at ${_name}.`,
      orderNowCta: "Book Now",
      viewMenuCta: "View Experiences",
      viewMenuRoute: "/experiences",
      findUsKicker: "Find us",
      visitLocationCta: "Visit this studio →",
      mainLocationLabel: "Main studio",
      secondLocationLabel: "Second studio",
      connectGoogleAddressNote: "Import your address, hours, ratings, and reviews from Google Places.",
      addSecondLocationNote: "Add a second studio once your first is connected.",
      connectGoogleCta: "Import from Google Maps →",
      latelyKicker: "Lately",
      ourStoryKicker: "Our story",
      readMoreCta: "Read more →",
      reviewsKicker: "Reviews",
      guestReviewsLabel: "Guest reviews & ratings.",
      whatGuestsSayLabel: "What your guests say.",
      noReviewsLabel: "No reviews yet.",
      connectGoogleReviewsCta: "Import reviews from Google Places →",
      allLocationsFilter: "All locations",
      aboutHeroTitle: "About us",
      aboutHeroSubtitle: "",
      ourStoryTitle: "Our Story",
      ourJourneyKicker: "The journey",
      ourJourneyTitle: "Our Journey",
      onlineOrderingNotAvailable: "Online booking not available",
      wedLoveToSeeYou: "We'd love to see you in person.",
      orderKicker: "Book",
      orderHeroTitle: "Book online",
      preferReservation: "Prefer to",
      grabLabel: "Grab",
      uberEatsLabel: "Uber Eats",
      foodpandaLabel: "FoodPanda",
      openNowLabel: "Open now",
      closedLabel: "Closed",
      mainDiningRoomLabel: "Main Studio",
      connectGoogleLocationsCta: "Add locations from Google Maps",
      additionalLocationsNote: "Additional locations appear here when added.",
      noExperiencesLabel: "No experiences available right now. Check back soon.",
      soldOutLabel: "Sold Out",
      temporarilyUnavailableLabel: "Temporarily unavailable",
      fullyBookedLabel: "Fully booked",
      notScheduledLabel: "Not currently scheduled",
      viewExperienceCta: "View experience",
      guestsMaxLabel: "guests max",
      durationHourLabel: "hr",
      durationMinuteLabel: "min",
      nameLabel: "Name",
      namePlaceholder: "Your name",
      emailLabel: "Email",
      emailPlaceholder: "you@example.com",
      phoneLabel: "Phone",
      phonePlaceholder: "+66 81 234 5678",
      dateLabel: "Date",
      pickDayLabel: "Pick a day above to continue.",
      timeLabel: "Time",
      selectTimeLabel: "Select a time",
      guestsLabel: "Guests",
      selectGuestsLabel: "Select guests",
      specialRequestsLabel: "Special requests",
      specialRequestsPlaceholder: "Tell us anything that will help us prepare for your visit.",
      guestLabel: "guest",
      guestsLabelPlural: "guests",
      contactInfoHeading: "Contact Information",
      phoneLabelShort: "Phone",
      emailLabelShort: "Email",
      reservationPoliciesHeading: "Booking Policies",
      goodToKnowKicker: "Good to know",
      callButtonLabel: "Call",
      contactFormButtonLabel: "Contact Form",
      locationLabel: "Studio",
      selectLocationLabel: "Select a studio",
      chooseLocationLabel: "Please choose a studio.",
      oneGuestLabel: "1 Guest",
      seoOrderDescription: (_name: string) => `Order online from ${_name}.`,
      thankYouLabel: (_name: string) => `Thank you, ${_name}!`,
      confirmationMessage: (_guests: number | string, _guestLabel: string, _date: string, _time: string) =>
        `We've received your request for ${_guests} ${_guestLabel} on ${_date} at ${_time}.`,
      manageLabel: (_word: string) => `Manage ${_word}`,
      cancelAnytimeLabel: "Changed your plans? Cancel anytime before your visit.",
      callUsLabel: (_phone: string) => `Call us: ${_phone}`,
      makeAnotherLabel: (_word: string) => `Make another ${_word}`,
      cancelLabel: (_word: string) => `Cancel ${_word}`,
    },
  },
  th: {
    restaurant: {
      poweredByTagline: "เว็บไซต์ร้านอาหารที่ดูแลตัวเองได้",
      aboutImageAlt: "เกี่ยวกับร้านอาหารของเรา",
      ctaTitle: "มากินด้วยกัน",
      ctaRoute: "/reservations",
      contactSubtitle:
        "สำหรับการจองหรือมาเยี่ยมชม ให้ไปที่สาขาใกล้คุณที่สุด หากเป็นเรื่องสื่อ พาร์ตเนอร์ งานจัดเลี้ยง หรือเรื่องอื่น ๆ ใช้แบบฟอร์มด้านล่างได้เลย",
      contactSubjectCatering: "งานจัดเลี้ยงและอีเวนต์",
      reserveCta: "จองโต๊ะ",
      reservationPageKicker: "การจอง",
      reservationFormTitle: "ทำรายการจอง",
      reservationRequestButton: "ขอจองโต๊ะ",
      reservationWord: "การจอง",
      reservationExploreLabel: "ดูเมนู",
      reservationExploreRoute: "/menu",
      experiencesPageTitle: "ประสบการณ์",
      experiencesPageSubtitle:
        "คลาส อาหารค่ำพิเศษ และคืนพิเศษที่จองได้ นอกเหนือจากการจองโต๊ะปกติ",
      locationGroupLine: (_count: number) => {
        const count = _count
        return `${count} สาขา ปรัชญาครัวเดียว`
      },
      postsEyebrow: "จากครัว",
      bookingNotesPlaceholder:
        "ความต้องการด้านอาหาร คำขอเรื่องการเข้าถึง ที่นั่งที่ชอบ หรือบันทึกสำหรับการฉลอง",
      contactLocationsByHeading: "เวลาทำการ ที่อยู่ โทรศัพท์ สำหรับแต่ละพื้นที่",
      contactLocationsByNote:
        'สำหรับรายละเอียดที่จอดรถ การเข้าถึง และนโยบายต่าง ๆ ให้กดลิงก์ "วางแผนการมาเยือน" ในแต่ละการ์ด',
      otherLocationsHeading: "ห้องพี่น้อง",
      highlightsSectionHeading: "โพสต์ รีวิว และเมนูจากทั่วทั้งแบรนด์",
      seoReservationDescription: (_name: string) => `จองโต๊ะที่ ${_name}`,
      seoExperiencesDescription: (_name: string) =>
        `สำรวจคลาส ชิมอาหารค่ำ และประสบการณ์ที่จองได้ที่ ${_name}`,
      orderNowCta: "สั่งออนไลน์",
      viewMenuCta: "ดูเมนู",
      viewMenuRoute: "/menu",
      findUsKicker: "หาเรา",
      visitLocationCta: "เยี่ยมชมสาขานี้ →",
      mainLocationLabel: "สาขาหลัก",
      secondLocationLabel: "สาขาที่สอง",
      connectGoogleAddressNote: "นำเข้าที่อยู่ เวลาทำการ คะแนน และรีวิวจาก Google Places",
      addSecondLocationNote: "เพิ่มสาขาที่สองเมื่อสาขาแรกเชื่อมต่อแล้ว",
      connectGoogleCta: "นำเข้าจาก Google Maps →",
      latelyKicker: "ล่าสุด",
      ourStoryKicker: "เรื่องราวของเรา",
      readMoreCta: "อ่านต่อ →",
      reviewsKicker: "รีวิว",
      guestReviewsLabel: "รีวิวและคะแนนจากแขก",
      whatGuestsSayLabel: "สิ่งที่แขกพูดถึง",
      noReviewsLabel: "ยังไม่มีรีวิว",
      connectGoogleReviewsCta: "นำเข้ารีวิวจาก Google Places →",
      allLocationsFilter: "ทุกสาขา",
      aboutHeroTitle: "เกี่ยวกับเรา",
      aboutHeroSubtitle: "",
      ourStoryTitle: "เรื่องราวของเรา",
      ourJourneyKicker: "การเดินทาง",
      ourJourneyTitle: "การเดินทางของเรา",
      onlineOrderingNotAvailable: "ไม่มีการสั่งออนไลน์",
      wedLoveToSeeYou: "เรายินดีต้อนรับคุณอย่างใกล้ชิด",
      orderKicker: "สั่ง",
      orderHeroTitle: "สั่งออนไลน์",
      preferReservation: "ต้องการ",
      grabLabel: "Grab",
      uberEatsLabel: "Uber Eats",
      foodpandaLabel: "FoodPanda",
      openNowLabel: "เปิดอยู่",
      closedLabel: "ปิดแล้ว",
      mainDiningRoomLabel: "ห้องรับประทานอาหารหลัก",
      connectGoogleLocationsCta: "เพิ่มสาขาจาก Google Maps",
      additionalLocationsNote: "สาขาเพิ่มเติมจะปรากฏที่นี่เมื่อเพิ่มแล้ว",
      noExperiencesLabel: "ยังไม่มีประสบการณ์ให้เลือกตอนนี้ ตรวจสอบอีกครั้งเร็วๆ นี้",
      soldOutLabel: "เต็มแล้ว",
      temporarilyUnavailableLabel: "ปิดให้บริการชั่วคราว",
      fullyBookedLabel: "เต็มแล้ว",
      notScheduledLabel: "ยังไม่มีกำหนดการ",
      viewExperienceCta: "ดูประสบการณ์",
      guestsMaxLabel: "แขกสูงสุด",
      durationHourLabel: "ชม.",
      durationMinuteLabel: "นาที",
      nameLabel: "ชื่อ",
      namePlaceholder: "ชื่อของคุณ",
      emailLabel: "อีเมล",
      emailPlaceholder: "you@example.com",
      phoneLabel: "โทรศัพท์",
      phonePlaceholder: "+66 81 234 5678",
      dateLabel: "วันที่",
      pickDayLabel: "เลือกวันด้านบนเพื่อดำเนินการต่อ",
      timeLabel: "เวลา",
      selectTimeLabel: "เลือกเวลา",
      guestsLabel: "จำนวนแขก",
      selectGuestsLabel: "เลือกจำนวนแขก",
      specialRequestsLabel: "คำขอพิเศษ",
      specialRequestsPlaceholder: "บอกเราสิ่งใดก็ได้ที่จะช่วยเราเตรียมการสำหรับการเยี่ยมชมของคุณ",
      guestLabel: "แขก",
      guestsLabelPlural: "แขก",
      contactInfoHeading: "ข้อมูลติดต่อ",
      phoneLabelShort: "โทรศัพท์",
      emailLabelShort: "อีเมล",
      reservationPoliciesHeading: "นโยบายการจอง",
      goodToKnowKicker: "ควรทราบ",
      callButtonLabel: "โทร",
      contactFormButtonLabel: "แบบฟอร์มติดต่อ",
      locationLabel: "สาขา",
      selectLocationLabel: "เลือกสาขา",
      chooseLocationLabel: "กรุณาเลือกสาขา",
      oneGuestLabel: "1 แขก",
      seoOrderDescription: (_name: string) => `สั่งออนไลน์จาก ${_name}`,
      thankYouLabel: (_name: string) => `ขอบคุณ ${_name}!`,
      confirmationMessage: (_guests: number | string, _guestLabel: string, _date: string, _time: string) =>
        `การจองสำหรับ ${_guests} ${_guestLabel} วันที่ ${_date} เวลา ${_time} ได้รับการยืนยันแล้ว`,
      manageLabel: (_word: string) => `จัดการ${_word}`,
      cancelAnytimeLabel: "เปลี่ยนแผนแล้วหรือ? ยกเลิกได้ทุกเมื่อก่อนมาเยือน",
      callUsLabel: (_phone: string) => `โทรหาเรา: ${_phone}`,
      makeAnotherLabel: (_word: string) => `สร้าง${_word}ใหม่`,
      cancelLabel: (_word: string) => `ยกเลิก${_word}`,
    },
    experience: {
      poweredByTagline: "เว็บไซต์จองประสบการณ์ที่ดูแลตัวเองได้",
      aboutImageAlt: "เกี่ยวกับสตูดิโอของเรา",
      ctaTitle: "จองคลาส",
      ctaRoute: "/experiences",
      contactSubtitle:
        "สำหรับการจองคลาสหรือตรวจสอบคิว ให้ไปที่สตูดิโอใกล้คุณ หากเป็นเรื่องสื่อ พาร์ตเนอร์ เวิร์กช็อป หรือเรื่องอื่น ๆ ใช้แบบฟอร์มด้านล่างได้เลย",
      contactSubjectCatering: "เวิร์กช็อปและอีเวนต์",
      reserveCta: "จองคลาส",
      reservationPageKicker: "การจอง",
      reservationFormTitle: "สร้างการจอง",
      reservationRequestButton: "ขอจอง",
      reservationWord: "การจอง",
      reservationExploreLabel: "ดูประสบการณ์",
      reservationExploreRoute: "/experiences",
      experiencesPageTitle: "ประสบการณ์",
      experiencesPageSubtitle:
        "คลาส เวิร์กช็อป และเซสชันพิเศษที่จองได้ตอนนี้",
      locationGroupLine: (_count: number) => {
        const count = _count
        return `${count} สาขา ประสบการณ์ลงมือทำแบบเดียวกัน`
      },
      postsEyebrow: "จากสตูดิโอ",
      bookingNotesPlaceholder:
        "คำขอเรื่องการเข้าถึง รายละเอียดกลุ่ม หรือหมายเหตุอื่น ๆ",
      contactLocationsByHeading: "เวลาทำการ ที่อยู่ โทรศัพท์ สำหรับแต่ละสตูดิโอ",
      contactLocationsByNote:
        'สำหรับรายละเอียดที่จอดรถ การเข้าถึง และนโยบายการจอง ให้กดลิงก์ "วางแผนการมาเยือน" ในแต่ละการ์ด',
      otherLocationsHeading: "พื้นที่อื่น ๆ",
      highlightsSectionHeading: "โพสต์ รีวิว และคลาสจากทั่วทั้งสตูดิโอ",
      seoReservationDescription: (_name: string) => `จองคลาสที่ ${_name}`,
      seoExperiencesDescription: (_name: string) =>
        `เลือกดูคลาสและประสบการณ์ที่จองได้ที่ ${_name}`,
      orderNowCta: "จองเลย",
      viewMenuCta: "ดูประสบการณ์",
      viewMenuRoute: "/experiences",
      findUsKicker: "หาเรา",
      visitLocationCta: "เยี่ยมชมสตูดิโอนี้ →",
      mainLocationLabel: "สตูดิโอหลัก",
      secondLocationLabel: "สตูดิโอที่สอง",
      connectGoogleAddressNote: "นำเข้าที่อยู่ เวลาทำการ คะแนน และรีวิวจาก Google Places",
      addSecondLocationNote: "เพิ่มสตูดิโอที่สองเมื่อสตูดิโอแรกเชื่อมต่อแล้ว",
      connectGoogleCta: "นำเข้าจาก Google Maps →",
      latelyKicker: "ล่าสุด",
      ourStoryKicker: "เรื่องราวของเรา",
      readMoreCta: "อ่านต่อ →",
      reviewsKicker: "รีวิว",
      guestReviewsLabel: "รีวิวและคะแนนจากแขก",
      whatGuestsSayLabel: "สิ่งที่แขกพูดถึง",
      noReviewsLabel: "ยังไม่มีรีวิว",
      connectGoogleReviewsCta: "นำเข้ารีวิวจาก Google Places →",
      allLocationsFilter: "ทุกสาขา",
      aboutHeroTitle: "เกี่ยวกับเรา",
      aboutHeroSubtitle: "",
      ourStoryTitle: "เรื่องราวของเรา",
      ourJourneyKicker: "การเดินทาง",
      ourJourneyTitle: "การเดินทางของเรา",
      onlineOrderingNotAvailable: "ไม่มีการจองออนไลน์",
      wedLoveToSeeYou: "เรายินดีต้อนรับคุณอย่างใกล้ชิด",
      orderKicker: "จอง",
      orderHeroTitle: "จองออนไลน์",
      preferReservation: "ต้องการ",
      grabLabel: "Grab",
      uberEatsLabel: "Uber Eats",
      foodpandaLabel: "FoodPanda",
      openNowLabel: "เปิดอยู่",
      closedLabel: "ปิดแล้ว",
      mainDiningRoomLabel: "สตูดิโอหลัก",
      connectGoogleLocationsCta: "เพิ่มสาขาจาก Google Maps",
      additionalLocationsNote: "สาขาเพิ่มเติมจะปรากฏที่นี่เมื่อเพิ่มแล้ว",
      noExperiencesLabel: "ยังไม่มีประสบการณ์ให้เลือกตอนนี้ ตรวจสอบอีกครั้งเร็วๆ นี้",
      soldOutLabel: "เต็มแล้ว",
      temporarilyUnavailableLabel: "ปิดให้บริการชั่วคราว",
      fullyBookedLabel: "เต็มแล้ว",
      notScheduledLabel: "ยังไม่มีกำหนดการ",
      viewExperienceCta: "ดูประสบการณ์",
      guestsMaxLabel: "แขกสูงสุด",
      durationHourLabel: "ชม.",
      durationMinuteLabel: "นาที",
      nameLabel: "ชื่อ",
      namePlaceholder: "ชื่อของคุณ",
      emailLabel: "อีเมล",
      emailPlaceholder: "you@example.com",
      phoneLabel: "โทรศัพท์",
      phonePlaceholder: "+66 81 234 5678",
      dateLabel: "วันที่",
      pickDayLabel: "เลือกวันด้านบนเพื่อดำเนินการต่อ",
      timeLabel: "เวลา",
      selectTimeLabel: "เลือกเวลา",
      guestsLabel: "จำนวนแขก",
      selectGuestsLabel: "เลือกจำนวนแขก",
      specialRequestsLabel: "คำขอพิเศษ",
      specialRequestsPlaceholder: "บอกเราสิ่งใดก็ได้ที่จะช่วยเราเตรียมการสำหรับการเยี่ยมชมของคุณ",
      guestLabel: "แขก",
      guestsLabelPlural: "แขก",
      contactInfoHeading: "ข้อมูลติดต่อ",
      phoneLabelShort: "โทรศัพท์",
      emailLabelShort: "อีเมล",
      reservationPoliciesHeading: "นโยบายการจอง",
      goodToKnowKicker: "ควรทราบ",
      callButtonLabel: "โทร",
      contactFormButtonLabel: "แบบฟอร์มติดต่อ",
      locationLabel: "สตูดิโอ",
      selectLocationLabel: "เลือกสตูดิโอ",
      chooseLocationLabel: "กรุณาเลือกสตูดิโอ",
      oneGuestLabel: "1 แขก",
      seoOrderDescription: (_name: string) => `สั่งออนไลน์จาก ${_name}`,
      thankYouLabel: (_name: string) => `ขอบคุณ ${_name}!`,
      confirmationMessage: (_guests: number | string, _guestLabel: string, _date: string, _time: string) =>
        `เราได้รับคำขอของคุณสำหรับ ${_guests} ${_guestLabel} วันที่ ${_date} เวลา ${_time}`,
      manageLabel: (_word: string) => `จัดการ${_word}`,
      cancelAnytimeLabel: "เปลี่ยนแผนแล้วหรือ? ยกเลิกได้ทุกเมื่อก่อนมาเยือน",
      callUsLabel: (_phone: string) => `โทรหาเรา: ${_phone}`,
      makeAnotherLabel: (_word: string) => `สร้าง${_word}ใหม่`,
      cancelLabel: (_word: string) => `ยกเลิก${_word}`,
    },
  },
}

registry.en.service = {
  ...(registry.en.experience ?? registry.en.restaurant!),
  poweredByTagline: "professional-service sites that stay current",
  aboutImageAlt: "About our organization",
  ctaTitle: "Talk with our team.",
  ctaRoute: "",
  contactSubtitle:
    "For a consultation or service question, use the form below or choose a direct contact option.",
  contactSubjectCatering: "Services",
  reserveCta: "",
  reservationPageKicker: "Consultations",
  reservationFormTitle: "Request a Consultation",
  reservationRequestButton: "Request Consultation",
  reservationWord: "consultation",
  reservationExploreLabel: "View Services",
  reservationExploreRoute: "/services",
  experiencesPageTitle: "Services",
  experiencesPageSubtitle:
    "Professional services and practice areas you can explore before getting in touch.",
  locationGroupLine: (_count: number) => {
    const count = _count
    return `${count} service presence${count === 1 ? "" : "s"}, one team.`
  },
  postsEyebrow: "Updates",
  bookingNotesPlaceholder:
    "Tell us what kind of help you need, preferred contact times, or accessibility notes.",
  contactLocationsByHeading: "Contact details and service-area information.",
  contactLocationsByNote:
    "Some professional-service locations may represent a service area or remote contact point rather than a public office.",
  otherLocationsHeading: "Other service areas",
  highlightsSectionHeading: "Services, articles, and updates from the organization.",
  seoReservationDescription: (_name: string) => `Request a consultation with ${_name}.`,
  seoExperiencesDescription: (_name: string) =>
    `Explore professional services from ${_name}.`,
  orderNowCta: "Book Now",
  viewMenuCta: "View Services",
  viewMenuRoute: "/services",
  findUsKicker: "Contact",
  visitLocationCta: "View contact details",
  mainLocationLabel: "Primary contact",
  secondLocationLabel: "Additional contact",
  connectGoogleAddressNote: "Optionally import public office details and hours from Google Places.",
  addSecondLocationNote: "Add another office or service-area presence when needed.",
  connectGoogleCta: "Import from Google Maps",
  latelyKicker: "Latest",
  ourStoryKicker: "About",
  readMoreCta: "Read more",
  reviewsKicker: "Reviews",
  guestReviewsLabel: "Client reviews and ratings.",
  whatGuestsSayLabel: "What clients say.",
  noReviewsLabel: "No reviews yet.",
  connectGoogleReviewsCta: "Import reviews from Google Places",
  allLocationsFilter: "All",
  aboutHeroTitle: "About us",
  aboutHeroSubtitle: "",
  ourStoryTitle: "Our Story",
  ourJourneyKicker: "Our work",
  ourJourneyTitle: "How We Help",
  onlineOrderingNotAvailable: "Online booking not available",
  wedLoveToSeeYou: "We would be glad to hear from you.",
  orderKicker: "Consultation",
  orderHeroTitle: "",
  preferReservation: "Prefer to",
  grabLabel: "External booking",
  uberEatsLabel: "External booking",
  foodpandaLabel: "External booking",
  openNowLabel: "Open now",
  closedLabel: "Closed",
  mainDiningRoomLabel: "Primary office",
  connectGoogleLocationsCta: "Add public office details from Google Maps",
  additionalLocationsNote: "Additional offices or service areas appear here when added.",
  noExperiencesLabel: "No services are published yet.",
  soldOutLabel: "Unavailable",
  temporarilyUnavailableLabel: "Temporarily unavailable",
  fullyBookedLabel: "Fully booked",
  notScheduledLabel: "Not currently scheduled",
  viewExperienceCta: "View service",
  guestsMaxLabel: "people max",
  durationHourLabel: "hr",
  durationMinuteLabel: "min",
  specialRequestsLabel: "How can we help?",
  specialRequestsPlaceholder: "Tell us what kind of help you need.",
  guestLabel: "person",
  guestsLabelPlural: "people",
  reservationPoliciesHeading: "Consultation Details",
  goodToKnowKicker: "Good to know",
  locationLabel: "Office",
  selectLocationLabel: "Select an office",
  chooseLocationLabel: "Please choose an office or contact point.",
  oneGuestLabel: "1 person",
  seoOrderDescription: (_name: string) => "",
  confirmationMessage: (_guests: number | string, _guestLabel: string, _date: string, _time: string) =>
    `We have received your consultation request for ${_guests} ${_guestLabel} on ${_date} at ${_time}.`,
  callUsLabel: (_phone: string) => `Call: ${_phone}`,
}

registry.th.service = registry.en.service!

// Japanese has complete copy for every supported vertical. Shared wording is
// composed within Japanese; no English registry entry supplies Japanese text.
registry.ja.restaurant = {
  poweredByTagline: "自動で運営できる飲食店のウェブサイト",
  aboutImageAlt: "当店について",
  ctaTitle: "お食事にいらっしゃいませんか。",
  ctaRoute: "/reservations",
  contactSubtitle: "ご予約やご来店については最寄りの店舗ページをご確認ください。取材、提携、ケータリング、その他のお問い合わせは下記フォームをご利用ください。",
  contactSubjectCatering: "ケータリング・イベント",
  reserveCta: "席を予約する",
  reservationPageKicker: "ご予約",
  reservationFormTitle: "席のご予約",
  reservationRequestButton: "予約を申し込む",
  reservationWord: "予約",
  reservationExploreLabel: "メニューを見る",
  reservationExploreRoute: "/menu",
  experiencesPageTitle: "体験",
  experiencesPageSubtitle: "通常のお席のご予約に加え、料理教室や特別なディナーなどをお楽しみいただけます。",
  locationGroupLine: (_count: number) => `${_count}店舗で、料理への同じ想いを。`,
  postsEyebrow: "厨房からのお知らせ",
  bookingNotesPlaceholder: "食事制限、バリアフリー対応、ご希望のお席、お祝いなどについてお知らせください。",
  contactLocationsByHeading: "各店舗の営業時間・住所・電話番号。",
  contactLocationsByNote: "駐車場、バリアフリー対応、各種方針の詳細は、各店舗の「来店情報」からご確認ください。",
  otherLocationsHeading: "姉妹店",
  highlightsSectionHeading: "各店舗の投稿・レビュー・料理。",
  seoReservationDescription: (_name: string) => `${_name}のお席をご予約いただけます。`,
  seoExperiencesDescription: (_name: string) => `${_name}の料理教室、テイスティング、各種体験をご覧ください。`,
  orderNowCta: "今すぐ注文",
  viewMenuCta: "メニューを見る",
  viewMenuRoute: "/menu",
  findUsKicker: "アクセス",
  visitLocationCta: "この店舗を見る →",
  mainLocationLabel: "本店",
  secondLocationLabel: "2号店",
  connectGoogleAddressNote: "Google Placesから住所、営業時間、評価、レビューをインポートします。",
  addSecondLocationNote: "最初の店舗を接続した後、2店舗目を追加できます。",
  connectGoogleCta: "Google マップからインポート →",
  latelyKicker: "最新情報",
  ourStoryKicker: "私たちのストーリー",
  readMoreCta: "続きを読む →",
  reviewsKicker: "レビュー",
  guestReviewsLabel: "お客様のレビューと評価。",
  whatGuestsSayLabel: "お客様の声。",
  noReviewsLabel: "まだレビューはありません。",
  connectGoogleReviewsCta: "Google Placesからレビューをインポート →",
  allLocationsFilter: "すべての店舗",
  aboutHeroTitle: "私たちについて",
  aboutHeroSubtitle: "",
  ourStoryTitle: "私たちのストーリー",
  ourJourneyKicker: "これまでの歩み",
  ourJourneyTitle: "私たちの歩み",
  onlineOrderingNotAvailable: "オンライン注文はご利用いただけません",
  wedLoveToSeeYou: "ご来店をお待ちしております。",
  orderKicker: "ご注文",
  orderHeroTitle: "オンライン注文",
  preferReservation: "ご希望の場合は",
  grabLabel: "Grab",
  uberEatsLabel: "Uber Eats",
  foodpandaLabel: "FoodPanda",
  openNowLabel: "営業中",
  closedLabel: "営業時間外",
  mainDiningRoomLabel: "メインダイニング",
  connectGoogleLocationsCta: "Google マップから店舗を追加",
  additionalLocationsNote: "追加した店舗がここに表示されます。",
  noExperiencesLabel: "現在ご予約いただける体験はありません。",
  soldOutLabel: "満席",
  temporarilyUnavailableLabel: "一時的にご利用いただけません",
  fullyBookedLabel: "予約で満席です",
  notScheduledLabel: "現在の開催予定はありません",
  viewExperienceCta: "体験を見る",
  guestsMaxLabel: "名まで",
  durationHourLabel: "時間",
  durationMinuteLabel: "分",
  nameLabel: "お名前",
  namePlaceholder: "お名前を入力してください",
  emailLabel: "メールアドレス",
  emailPlaceholder: "you@example.com",
  phoneLabel: "電話番号",
  phonePlaceholder: "+66 81 234 5678",
  dateLabel: "日付",
  pickDayLabel: "上から日付を選択してください。",
  timeLabel: "時間",
  selectTimeLabel: "時間を選択",
  guestsLabel: "人数",
  selectGuestsLabel: "人数を選択",
  specialRequestsLabel: "特別なご要望",
  specialRequestsPlaceholder: "ご来店にあたり、ご希望などがありましたらお知らせください。",
  guestLabel: "名",
  guestsLabelPlural: "名",
  contactInfoHeading: "連絡先",
  phoneLabelShort: "電話",
  emailLabelShort: "メール",
  reservationPoliciesHeading: "ご予約について",
  goodToKnowKicker: "ご案内",
  callButtonLabel: "電話する",
  contactFormButtonLabel: "お問い合わせフォーム",
  locationLabel: "店舗",
  selectLocationLabel: "店舗を選択",
  chooseLocationLabel: "店舗を選択してください。",
  oneGuestLabel: "1名",
  seoOrderDescription: (_name: string) => `${_name}からオンラインでご注文いただけます。`,
  thankYouLabel: (_name: string) => `${_name}様、ありがとうございます。`,
  confirmationMessage: (_guests: number | string, _guestLabel: string, _date: string, _time: string) =>
    `${_date} ${_time}、${_guests}${_guestLabel}様のご予約が確定しました。`,
  manageLabel: (_word: string) => `${_word}を管理`,
  cancelAnytimeLabel: "ご予定が変わった場合は、ご来店前にキャンセルできます。",
  callUsLabel: (_phone: string) => `お電話：${_phone}`,
  makeAnotherLabel: (_word: string) => `新しい${_word}をする`,
  cancelLabel: (_word: string) => `${_word}をキャンセル`,
}

registry.ja.experience = {
  ...registry.ja.restaurant,
  poweredByTagline: "自動で運営できる体験予約のウェブサイト",
  aboutImageAlt: "スタジオについて",
  ctaTitle: "クラスを予約する。",
  ctaRoute: "/experiences",
  contactSubtitle: "クラスのご予約や空き状況は最寄りのスタジオページをご確認ください。取材、提携、ワークショップ、その他のお問い合わせは下記フォームをご利用ください。",
  contactSubjectCatering: "ワークショップ・イベント",
  reserveCta: "クラスを予約する",
  reservationFormTitle: "体験のご予約",
  reservationExploreLabel: "体験を見る",
  reservationExploreRoute: "/experiences",
  experiencesPageSubtitle: "ご予約可能なクラス、ワークショップ、特別なセッションをご覧ください。",
  locationGroupLine: (_count: number) => `${_count}か所で、同じ体験を。`,
  postsEyebrow: "スタジオからのお知らせ",
  bookingNotesPlaceholder: "バリアフリー対応、グループの詳細、その他のご要望をお知らせください。",
  contactLocationsByHeading: "各スタジオの営業時間・住所・電話番号。",
  contactLocationsByNote: "駐車場、バリアフリー対応、ご予約の詳細は、各スタジオの「来店情報」からご確認ください。",
  otherLocationsHeading: "その他のスタジオ",
  highlightsSectionHeading: "各スタジオの投稿・レビュー・クラス。",
  seoReservationDescription: (_name: string) => `${_name}のクラスをご予約いただけます。`,
  seoExperiencesDescription: (_name: string) => `${_name}のクラスや各種体験をご覧ください。`,
  orderNowCta: "今すぐ予約",
  viewMenuCta: "体験を見る",
  viewMenuRoute: "/experiences",
  visitLocationCta: "このスタジオを見る →",
  mainLocationLabel: "メインスタジオ",
  secondLocationLabel: "2つ目のスタジオ",
  addSecondLocationNote: "最初のスタジオを接続した後、2つ目を追加できます。",
  onlineOrderingNotAvailable: "オンライン予約はご利用いただけません",
  orderKicker: "ご予約",
  orderHeroTitle: "オンライン予約",
  mainDiningRoomLabel: "メインスタジオ",
  locationLabel: "スタジオ",
  selectLocationLabel: "スタジオを選択",
  chooseLocationLabel: "スタジオを選択してください。",
  seoOrderDescription: (_name: string) => `${_name}の体験をオンラインでご予約いただけます。`,
  confirmationMessage: (_guests: number | string, _guestLabel: string, _date: string, _time: string) =>
    `${_date} ${_time}、${_guests}${_guestLabel}様のご予約リクエストを受け付けました。`,
}

registry.ja.service = {
  ...registry.ja.experience,
  poweredByTagline: "常に最新の情報を届ける専門サービスのウェブサイト",
  aboutImageAlt: "私たちの組織について",
  ctaTitle: "私たちにご相談ください。",
  ctaRoute: "",
  contactSubtitle: "ご相談やサービスに関するご質問は、下記フォームまたは直接の連絡先からお問い合わせください。",
  contactSubjectCatering: "サービス",
  reserveCta: "",
  reservationPageKicker: "ご相談",
  reservationFormTitle: "相談を申し込む",
  reservationRequestButton: "相談を申し込む",
  reservationWord: "相談",
  reservationExploreLabel: "サービスを見る",
  reservationExploreRoute: "/services",
  experiencesPageTitle: "サービス",
  experiencesPageSubtitle: "お問い合わせの前に、専門サービスや対応分野をご覧ください。",
  locationGroupLine: (_count: number) => `${_count}の拠点で、ひとつのチームが対応します。`,
  postsEyebrow: "お知らせ",
  bookingNotesPlaceholder: "ご相談内容、ご希望の連絡時間、バリアフリー対応などについてお知らせください。",
  contactLocationsByHeading: "連絡先と対応地域。",
  contactLocationsByNote: "拠点には、ご来訪いただける事務所以外に、対応地域やオンライン窓口が含まれる場合があります。",
  otherLocationsHeading: "その他の対応地域",
  highlightsSectionHeading: "サービス・記事・最新情報。",
  seoReservationDescription: (_name: string) => `${_name}へのご相談をお申し込みいただけます。`,
  seoExperiencesDescription: (_name: string) => `${_name}の専門サービスをご覧ください。`,
  orderNowCta: "今すぐ予約",
  viewMenuCta: "サービスを見る",
  viewMenuRoute: "/services",
  findUsKicker: "お問い合わせ",
  visitLocationCta: "連絡先を見る",
  mainLocationLabel: "主な連絡先",
  secondLocationLabel: "その他の連絡先",
  connectGoogleAddressNote: "必要に応じて、Google Placesから事務所の情報や営業時間をインポートできます。",
  addSecondLocationNote: "必要に応じて、別の事務所や対応地域を追加できます。",
  allLocationsFilter: "すべて",
  ourStoryKicker: "私たちについて",
  ourJourneyKicker: "私たちの仕事",
  ourJourneyTitle: "私たちにできること",
  wedLoveToSeeYou: "お問い合わせをお待ちしております。",
  orderKicker: "ご相談",
  orderHeroTitle: "",
  grabLabel: "外部予約",
  uberEatsLabel: "外部予約",
  foodpandaLabel: "外部予約",
  mainDiningRoomLabel: "主な事務所",
  connectGoogleLocationsCta: "Google マップから事務所の情報を追加",
  additionalLocationsNote: "追加した事務所や対応地域がここに表示されます。",
  noExperiencesLabel: "公開されているサービスはまだありません。",
  soldOutLabel: "受付終了",
  viewExperienceCta: "サービスを見る",
  specialRequestsLabel: "ご相談内容",
  specialRequestsPlaceholder: "どのようなお手伝いが必要かお知らせください。",
  reservationPoliciesHeading: "ご相談の詳細",
  locationLabel: "事務所",
  selectLocationLabel: "事務所を選択",
  chooseLocationLabel: "事務所または窓口を選択してください。",
  seoOrderDescription: (_name: string) => "",
  confirmationMessage: (_guests: number | string, _guestLabel: string, _date: string, _time: string) =>
    `${_date} ${_time}、${_guests}${_guestLabel}様のご相談リクエストを受け付けました。`,
}

export function normalizeVertical(vertical: string | null | undefined): string {
  // `sites.vertical` is NOT NULL (sites_vertical_check in server/db/schema.ts).
  // Every caller already gates on the site being loaded before calling this,
  // or uses its own local ref for a genuine pre-creation onboarding default —
  // so a missing vertical here means the caller's data source failed to load,
  // not a state to paper over with a default vertical's copy.
  if (vertical == null || vertical === "") {
    throw new Error("normalizeVertical() received a missing vertical — the site data has not loaded correctly.")
  }
  return vertical
}

export function getVerticalLabel(vertical: string | null | undefined): string {
  const v = normalizeVertical(vertical)
  if (v === "service") return "Professional services"
  if (v === "experience") return "Experience"
  if (v === "restaurant") return "Restaurant"
  return "Business"
}

export function getVerticalCopy(vertical: string | null | undefined, locale: string | null | undefined = "en"): VerticalCopy {
  const v = normalizeVertical(vertical)
  const l = String(locale ?? "en") as LocaleCode
  const byLocale = Object.prototype.hasOwnProperty.call(registry, l) ? registry[l]! : registry.en
  const localized = byLocale[v as SiteVertical]
  if (localized) return localized
  const english = registry.en[v as SiteVertical]
  if (english) return english
  // `v` is a value the sites_vertical_check constraint allows (e.g. 'retail',
  // 'wellness') but that isn't in ALL_VERTICALS/the copy registry yet, or an
  // unrecognized string entirely — a real data/registry gap, not a state to
  // paper over with restaurant copy.
  throw new Error(`getVerticalCopy() has no registry entry for vertical "${v}".`)
}

// Restaurants and professional services get their schema.org subtype plus
// LocalBusiness; other verticals fall back to the generic LocalBusiness type.
export function getBusinessSchemaTypes(vertical: string | null | undefined): string[] {
  const v = normalizeVertical(vertical)
  if (v === "restaurant") return ["Restaurant", "LocalBusiness"]
  if (v === "service") return ["ProfessionalService", "LocalBusiness"]
  return ["LocalBusiness"]
}
