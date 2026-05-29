#!/usr/bin/env node
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

// SQL to update component field based on field patterns (using escaped literals)
const updateStatements = Object.entries(fieldToComponentMap).map(([field, component]) => {
  // Escape single quotes to prevent SQL injection
  const safeField = field.replace(/'/g, "''")
  const safeComponent = component.replace(/'/g, "''")
  return `UPDATE site_content SET component = '${safeComponent}' WHERE field = '${safeField}' AND component IS NULL;`
}).join('\n')

console.log('SQL Update Statements:')
console.log(updateStatements)
