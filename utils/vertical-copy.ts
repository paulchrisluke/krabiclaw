export type SiteVertical =
  | "restaurant"
  | "experience"
  | "professional_service";

type LocaleCode = "en" | "th";

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
  brandStoryPlaceholder: string
  brandStoryDescription: string
  addStoryCta: string
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
  confirmSoonLabel: (_word: string) => string
  manageLabel: (_word: string) => string
  cancelAnytimeLabel: string
  callUsLabel: (_phone: string) => string
  makeAnotherLabel: (_word: string) => string
  cancelLabel: (_word: string) => string
}

const registry: Record<LocaleCode, Partial<Record<SiteVertical, VerticalCopy>>> = {
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
      connectGoogleAddressNote: "Connect Google Business to sync your address, hours, photos and reviews.",
      addSecondLocationNote: "Add a second location once your first is connected.",
      connectGoogleCta: "Connect Google Business →",
      latelyKicker: "Lately",
      ourStoryKicker: "Our story",
      readMoreCta: "Read more →",
      brandStoryPlaceholder: "Your brand story goes here.",
      brandStoryDescription: "Two or three sentences about your brand — what you do, how you do it, why it matters.",
      addStoryCta: "Add your story in the dashboard →",
      reviewsKicker: "Reviews",
      guestReviewsLabel: "Guest reviews & ratings.",
      whatGuestsSayLabel: "What your guests say.",
      noReviewsLabel: "No reviews yet.",
      connectGoogleReviewsCta: "Connect Google Business →",
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
      connectGoogleLocationsCta: "Connect Google Business to sync locations",
      additionalLocationsNote: "Additional locations appear here when added.",
      noExperiencesLabel: "No experiences available right now. Check back soon.",
      soldOutLabel: "Sold Out",
      temporarilyUnavailableLabel: "Temporarily unavailable",
      fullyBookedLabel: "Fully booked",
      notScheduledLabel: "Not currently scheduled",
      viewExperienceCta: "View experience",
      guestsMaxLabel: "guests max",
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
        `We've received your request for ${_guests} ${_guestLabel} on ${_date} at ${_time}.`,
      confirmSoonLabel: (_word: string) => `Our team will confirm your ${_word} shortly via email or phone.`,
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
      connectGoogleAddressNote: "Connect Google Business to sync your address, hours, photos and reviews.",
      addSecondLocationNote: "Add a second studio once your first is connected.",
      connectGoogleCta: "Connect Google Business →",
      latelyKicker: "Lately",
      ourStoryKicker: "Our story",
      readMoreCta: "Read more →",
      brandStoryPlaceholder: "Your brand story goes here.",
      brandStoryDescription: "Two or three sentences about your brand — what you do, how you do it, why it matters.",
      addStoryCta: "Add your story in the dashboard →",
      reviewsKicker: "Reviews",
      guestReviewsLabel: "Guest reviews & ratings.",
      whatGuestsSayLabel: "What your guests say.",
      noReviewsLabel: "No reviews yet.",
      connectGoogleReviewsCta: "Connect Google Business →",
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
      connectGoogleLocationsCta: "Connect Google Business to sync locations",
      additionalLocationsNote: "Additional locations appear here when added.",
      noExperiencesLabel: "No experiences available right now. Check back soon.",
      soldOutLabel: "Sold Out",
      temporarilyUnavailableLabel: "Temporarily unavailable",
      fullyBookedLabel: "Fully booked",
      notScheduledLabel: "Not currently scheduled",
      viewExperienceCta: "View experience",
      guestsMaxLabel: "guests max",
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
      confirmSoonLabel: (_word: string) => `Our team will confirm your ${_word} shortly via email or phone.`,
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
      reservationRequestButton: "ขอจอง",
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
      connectGoogleAddressNote: "เชื่อมต่อ Google Business เพื่อซิงค์ที่อยู่ เวลาทำการ รูปภาพ และรีวิว",
      addSecondLocationNote: "เพิ่มสาขาที่สองเมื่อสาขาแรกเชื่อมต่อแล้ว",
      connectGoogleCta: "เชื่อมต่อ Google Business →",
      latelyKicker: "ล่าสุด",
      ourStoryKicker: "เรื่องราวของเรา",
      readMoreCta: "อ่านต่อ →",
      brandStoryPlaceholder: "เรื่องราวแบรนด์ของคุณอยู่ที่นี่",
      brandStoryDescription: "สองสามประโยคเกี่ยวกับแบรนด์ของคุณ — คุณทำอะไร ทำอย่างไร และทำไมถึงสำคัญ",
      addStoryCta: "เพิ่มเรื่องราวในแดชบอร์ด →",
      reviewsKicker: "รีวิว",
      guestReviewsLabel: "รีวิวและคะแนนจากแขก",
      whatGuestsSayLabel: "สิ่งที่แขกพูดถึง",
      noReviewsLabel: "ยังไม่มีรีวิว",
      connectGoogleReviewsCta: "เชื่อมต่อ Google Business →",
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
      connectGoogleLocationsCta: "เชื่อมต่อ Google Business เพื่อซิงค์สาขา",
      additionalLocationsNote: "สาขาเพิ่มเติมจะปรากฏที่นี่เมื่อเพิ่มแล้ว",
      noExperiencesLabel: "ยังไม่มีประสบการณ์ให้เลือกตอนนี้ ตรวจสอบอีกครั้งเร็วๆ นี้",
      soldOutLabel: "เต็มแล้ว",
      temporarilyUnavailableLabel: "ปิดให้บริการชั่วคราว",
      fullyBookedLabel: "เต็มแล้ว",
      notScheduledLabel: "ยังไม่มีกำหนดการ",
      viewExperienceCta: "ดูประสบการณ์",
      guestsMaxLabel: "แขกสูงสุด",
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
        `เราได้รับคำขอของคุณสำหรับ ${_guests} ${_guestLabel} วันที่ ${_date} เวลา ${_time}`,
      confirmSoonLabel: (_word: string) => `ทีมของเราจะยืนยัน${_word}ของคุณเร็วๆ นี้ทางอีเมลหรือโทรศัพท์`,
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
      connectGoogleAddressNote: "เชื่อมต่อ Google Business เพื่อซิงค์ที่อยู่ เวลาทำการ รูปภาพ และรีวิว",
      addSecondLocationNote: "เพิ่มสตูดิโอที่สองเมื่อสตูดิโอแรกเชื่อมต่อแล้ว",
      connectGoogleCta: "เชื่อมต่อ Google Business →",
      latelyKicker: "ล่าสุด",
      ourStoryKicker: "เรื่องราวของเรา",
      readMoreCta: "อ่านต่อ →",
      brandStoryPlaceholder: "เรื่องราวแบรนด์ของคุณอยู่ที่นี่",
      brandStoryDescription: "สองสามประโยคเกี่ยวกับแบรนด์ของคุณ — คุณทำอะไร ทำอย่างไร และทำไมถึงสำคัญ",
      addStoryCta: "เพิ่มเรื่องราวในแดชบอร์ด →",
      reviewsKicker: "รีวิว",
      guestReviewsLabel: "รีวิวและคะแนนจากแขก",
      whatGuestsSayLabel: "สิ่งที่แขกพูดถึง",
      noReviewsLabel: "ยังไม่มีรีวิว",
      connectGoogleReviewsCta: "เชื่อมต่อ Google Business →",
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
      connectGoogleLocationsCta: "เชื่อมต่อ Google Business เพื่อซิงค์สาขา",
      additionalLocationsNote: "สาขาเพิ่มเติมจะปรากฏที่นี่เมื่อเพิ่มแล้ว",
      noExperiencesLabel: "ยังไม่มีประสบการณ์ให้เลือกตอนนี้ ตรวจสอบอีกครั้งเร็วๆ นี้",
      soldOutLabel: "เต็มแล้ว",
      temporarilyUnavailableLabel: "ปิดให้บริการชั่วคราว",
      fullyBookedLabel: "เต็มแล้ว",
      notScheduledLabel: "ยังไม่มีกำหนดการ",
      viewExperienceCta: "ดูประสบการณ์",
      guestsMaxLabel: "แขกสูงสุด",
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
      confirmSoonLabel: (_word: string) => `ทีมของเราจะยืนยัน${_word}ของคุณเร็วๆ นี้ทางอีเมลหรือโทรศัพท์`,
      manageLabel: (_word: string) => `จัดการ${_word}`,
      cancelAnytimeLabel: "เปลี่ยนแผนแล้วหรือ? ยกเลิกได้ทุกเมื่อก่อนมาเยือน",
      callUsLabel: (_phone: string) => `โทรหาเรา: ${_phone}`,
      makeAnotherLabel: (_word: string) => `สร้าง${_word}ใหม่`,
      cancelLabel: (_word: string) => `ยกเลิก${_word}`,
    },
  },
}

registry.en.professional_service = {
  ...(registry.en.experience ?? registry.en.restaurant!),
  poweredByTagline: "professional-service sites that stay current",
  aboutImageAlt: "About our organization",
  ctaTitle: "Talk with our team.",
  ctaRoute: "/schedule",
  contactSubtitle:
    "For a consultation or service question, use the form below or choose a direct contact option.",
  contactSubjectCatering: "Services",
  reserveCta: "Book a consultation",
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
  connectGoogleAddressNote: "Optionally connect Google Business to sync public office details, hours, photos, and reviews.",
  addSecondLocationNote: "Add another office or service-area presence when needed.",
  connectGoogleCta: "Connect Google Business",
  latelyKicker: "Latest",
  ourStoryKicker: "About",
  readMoreCta: "Read more",
  brandStoryPlaceholder: "Your organization story goes here.",
  brandStoryDescription: "Two or three sentences about the people you serve, what you do, and why it matters.",
  addStoryCta: "Add your story in the dashboard",
  reviewsKicker: "Reviews",
  guestReviewsLabel: "Client reviews and ratings.",
  whatGuestsSayLabel: "What clients say.",
  noReviewsLabel: "No reviews yet.",
  connectGoogleReviewsCta: "Connect Google Business",
  allLocationsFilter: "All",
  aboutHeroTitle: "About us",
  aboutHeroSubtitle: "",
  ourStoryTitle: "Our Story",
  ourJourneyKicker: "Our work",
  ourJourneyTitle: "How We Help",
  onlineOrderingNotAvailable: "Online booking not available",
  wedLoveToSeeYou: "We would be glad to hear from you.",
  orderKicker: "Consultation",
  orderHeroTitle: "Book a consultation",
  preferReservation: "Prefer to",
  grabLabel: "External booking",
  uberEatsLabel: "External booking",
  foodpandaLabel: "External booking",
  openNowLabel: "Open now",
  closedLabel: "Closed",
  mainDiningRoomLabel: "Primary office",
  connectGoogleLocationsCta: "Connect Google Business to sync public office details",
  additionalLocationsNote: "Additional offices or service areas appear here when added.",
  noExperiencesLabel: "No services are published yet.",
  soldOutLabel: "Unavailable",
  temporarilyUnavailableLabel: "Temporarily unavailable",
  fullyBookedLabel: "Fully booked",
  notScheduledLabel: "Not currently scheduled",
  viewExperienceCta: "View service",
  guestsMaxLabel: "people max",
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
  seoOrderDescription: (_name: string) => `Book a consultation with ${_name}.`,
  confirmationMessage: (_guests: number | string, _guestLabel: string, _date: string, _time: string) =>
    `We have received your consultation request for ${_guests} ${_guestLabel} on ${_date} at ${_time}.`,
  confirmSoonLabel: (_word: string) => `Our team will follow up about your ${_word} shortly.`,
  callUsLabel: (_phone: string) => `Call: ${_phone}`,
}

registry.th.professional_service = registry.en.professional_service!

export function getVerticalCopy(vertical: string | null | undefined, locale: string | null | undefined = "en"): VerticalCopy {
  const v = String(vertical ?? "restaurant")
  const l = String(locale ?? "en") as LocaleCode
  const byLocale = Object.prototype.hasOwnProperty.call(registry, l) ? registry[l]! : registry.en
  const localized = byLocale[v as SiteVertical]
  if (localized) return localized
  const english = registry.en[v as SiteVertical]
  if (english) return english
  return byLocale.restaurant ?? registry.en.restaurant!
}

// Restaurants and professional services get their schema.org subtype plus
// LocalBusiness; other verticals fall back to the generic LocalBusiness type.
export function getBusinessSchemaTypes(vertical: string | null | undefined): string[] {
  if (vertical === "restaurant") return ["Restaurant", "LocalBusiness"]
  if (vertical === "professional_service") return ["ProfessionalService", "LocalBusiness"]
  return ["LocalBusiness"]
}
