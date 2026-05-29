// Script to populate component field in site_content based on field patterns
// This maps existing field names to component identifiers for dynamic rendering

const fieldToComponentMap = {
  // Hero section
  'hero': 'SayaHero',
  'hero.title': 'SayaHero',
  'hero.subtitle': 'SayaHero',
  'hero.eyebrow': 'SayaHero',
  'hero.image': 'SayaHero',
  'hero.video': 'SayaHero',
  
  // Story section
  'story.headline': 'SayaAbout',
  'story.body': 'SayaAbout',
  'story.image': 'SayaAbout',
  'story.title': 'SayaAbout',
  
  // Journey section
  'journey.title': 'SayaAbout',
  'journey.body': 'SayaAbout',
  
  // Experience section
  'experience.body': 'SayaAbout',
  'experience.title': 'SayaAbout',
  
  // CTA section
  'cta.title': 'SayaCTA',
  'cta.description': 'SayaCTA',
  
  // Reviews section
  'reviews.heading': 'SayaReviews',
  
  // Posts section
  'posts.eyebrow': 'SayaPosts',
  'posts.heading': 'SayaPosts',
  
  // Locations section
  'locations.heading': 'SayaLocationsGrid',
  
  // QA section
  'qa.heading': 'SayaQA',
}

// SQL to update component field based on field patterns
const updateStatements = Object.entries(fieldToComponentMap).map(([field, component]) => {
  return `UPDATE site_content SET component = '${component}' WHERE field = '${field}' AND component IS NULL;`
}).join('\n')

console.log('SQL Update Statements:')
console.log(updateStatements)
