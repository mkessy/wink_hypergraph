#!/usr/bin/env node

/**
 * Test what Compromise.js features are actually available
 */

const compromise = require('compromise');

function testCompromiseFeatures() {
  console.log('Testing available Compromise.js features...\n');

  const text = "Dr. John Smith works at Harvard University in Boston on March 15, 2024.";
  const doc = compromise(text);

  console.log(`Original text: "${text}"\n`);

  // Test basic methods
  console.log('=== BASIC METHODS ===');
  
  try {
    console.log('✅ .text():', doc.text());
  } catch (e) {
    console.log('❌ .text():', e.message);
  }

  try {
    console.log('✅ .people():', doc.people().text());
  } catch (e) {
    console.log('❌ .people():', e.message);
  }

  try {
    console.log('✅ .places():', doc.places().text());
  } catch (e) {
    console.log('❌ .places():', e.message);
  }

  try {
    console.log('✅ .organizations():', doc.organizations().text());
  } catch (e) {
    console.log('❌ .organizations():', e.message);
  }

  try {
    console.log('✅ .dates():', typeof doc.dates === 'function' ? doc.dates().text() : 'Method not available');
  } catch (e) {
    console.log('❌ .dates():', e.message);
  }

  try {
    console.log('✅ .numbers():', typeof doc.numbers === 'function' ? doc.numbers().text() : 'Method not available');
  } catch (e) {
    console.log('❌ .numbers():', e.message);
  }

  try {
    console.log('✅ .chunks():', doc.chunks().text());
  } catch (e) {
    console.log('❌ .chunks():', e.message);
  }

  try {
    console.log('✅ .clauses():', typeof doc.clauses === 'function' ? doc.clauses().text() : 'Method not available');
  } catch (e) {
    console.log('❌ .clauses():', e.message);
  }

  try {
    console.log('✅ .phrases():', typeof doc.phrases === 'function' ? doc.phrases().text() : 'Method not available');
  } catch (e) {
    console.log('❌ .phrases():', e.message);
  }

  try {
    console.log('✅ .sentences():', doc.sentences().length, 'sentences');
  } catch (e) {
    console.log('❌ .sentences():', e.message);
  }

  try {
    console.log('✅ .terms():', doc.terms().length, 'terms');
  } catch (e) {
    console.log('❌ .terms():', e.message);
  }

  // Test normalization methods
  console.log('\n=== NORMALIZATION METHODS ===');
  
  try {
    const testDoc = compromise("don't you think it's great?");
    console.log('✅ .contractions().expand():', testDoc.contractions().expand().text());
  } catch (e) {
    console.log('❌ .contractions().expand():', e.message);
  }

  try {
    console.log('✅ .normalize():', compromise("  HELLO   world  ").normalize().text());
  } catch (e) {
    console.log('❌ .normalize():', e.message);
  }

  // Test detailed term information
  console.log('\n=== DETAILED TERM INFO ===');
  
  try {
    const terms = doc.terms().json();
    console.log(`✅ Terms JSON (${terms.length} terms):`);
    terms.slice(0, 3).forEach(term => {
      console.log(`    "${term.text}": tag=${term.tag}, tags=[${term.tags?.join(',')}]`);
    });
  } catch (e) {
    console.log('❌ Terms JSON:', e.message);
  }

  // Test matching
  console.log('\n=== MATCHING METHODS ===');
  
  try {
    console.log('✅ Match #Person:', doc.match('#Person').text());
  } catch (e) {
    console.log('❌ Match #Person:', e.message);
  }

  try {
    console.log('✅ Match #Place:', doc.match('#Place').text());
  } catch (e) {
    console.log('❌ Match #Place:', e.message);
  }

  try {
    console.log('✅ Match #Organization:', doc.match('#Organization').text());
  } catch (e) {
    console.log('❌ Match #Organization:', e.message);
  }

  try {
    console.log('✅ Match #Noun:', doc.match('#Noun').text());
  } catch (e) {
    console.log('❌ Match #Noun:', e.message);
  }

  try {
    console.log('✅ Match #Verb:', doc.match('#Verb').text());
  } catch (e) {
    console.log('❌ Match #Verb:', e.message);
  }

  console.log('\n=== AVAILABLE METHODS ===');
  
  const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(doc))
    .filter(method => typeof doc[method] === 'function')
    .sort();
  
  console.log('Available methods:', methods.slice(0, 20).join(', '), `... (${methods.length} total)`);
}

if (require.main === module) {
  testCompromiseFeatures();
}