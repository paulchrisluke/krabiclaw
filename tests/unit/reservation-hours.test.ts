import assert from 'node:assert/strict'
import test from 'node:test'
import { parseOpeningHours, parseSpecialHours, normalizeGoogleOpeningHours, getDateIntervals, generateReservationTimes, isOpenNow } from '../../shared/reservation-hours.ts'

test('weekly hours retain close weekdays, Sunday rollover and exact 23:59 endpoints', () => {
  const hours = parseOpeningHours({ periods: [{ open: { day: 6, hour: 22, minute: 0 }, close: { day: 0, hour: 2, minute: 0 } }] })
  assert.deepEqual(generateReservationTimes(hours, '2099-01-04'), ['00:00', '00:30', '01:00'])
  assert.equal(isOpenNow(hours, 'Asia/Bangkok', new Date('2099-01-03T18:00:00Z')), true)
  const exact = normalizeGoogleOpeningHours([{ open: { day: 1, hour: 12 }, close: { day: 1, hour: 23, minute: 59 } }])
  assert.deepEqual(exact?.periods[0]?.close, { day: 1, hour: 23, minute: 59 })
})

test('unknown, explicitly closed, and always open remain distinct', () => {
  assert.equal(getDateIntervals(null, null, '2099-01-05'), null)
  assert.deepEqual(getDateIntervals({ periods: [] }, null, '2099-01-05'), [])
  const always = normalizeGoogleOpeningHours([{ open: { day: 0 } }])
  assert.equal(generateReservationTimes(always, '2099-01-05').length, 48)
  assert.equal(isOpenNow(null, 'Asia/Bangkok'), undefined)
  assert.equal(isOpenNow(always, null), undefined)
})

test('dated exceptions replace incoming overnight hours and closures have inclusive and indefinite bounds', () => {
  const hours = parseOpeningHours({ periods: [{ open: { day: 1, hour: 22, minute: 0 }, close: { day: 2, hour: 2, minute: 0 } }] })
  const closedTuesday = parseSpecialHours([{ kind: 'hours', date: '2099-01-06', periods: [], note: null }])
  assert.deepEqual(generateReservationTimes(hours, '2099-01-06', { specialHours: closedTuesday }), [])
  assert.deepEqual(generateReservationTimes(hours, '2099-01-05', { specialHours: closedTuesday }), ['22:00', '22:30', '23:00'])
  const indefinite = parseSpecialHours([{ kind: 'closure', starts_on: '2099-01-01', ends_on: null, note: null }])
  assert.deepEqual(getDateIntervals(hours, indefinite, '2100-01-01'), [])
  const dated = parseSpecialHours([{ kind: 'hours', date: '2099-01-05', periods: [{ open_time: '23:00', close_time: '03:00', close_day_offset: 1 }], note: null }])
  assert.deepEqual(generateReservationTimes(hours, '2099-01-06', { specialHours: dated }), ['00:00', '00:30', '01:00', '01:30', '02:00'])
})

test('boundaries reject ambiguous hours instead of interpreting them', () => {
  for (const hours of ['Monday: 9-5', [], { weekdayDescriptions: ['Monday: 9-5'] }, { periods: [{ open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 9, minute: 0 } }] }]) assert.throws(() => parseOpeningHours(hours))
  assert.throws(() => parseOpeningHours({ periods: [{ open: { day: 0, hour: 0, minute: 0 } }, { open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 10, minute: 0 } }] }))
  assert.throws(() => parseSpecialHours([{ kind: 'closure', starts_on: '2099-02-30', ends_on: null, note: null }]))
})

test('overnight starts retain the opening minute grid and short closures do not erase later continuous days', () => {
  const hours = parseOpeningHours({ periods: [{ open: { day: 1, hour: 22, minute: 15 }, close: { day: 2, hour: 2, minute: 15 } }] })
  assert.deepEqual(generateReservationTimes(hours, '2099-01-06'), ['00:15', '00:45', '01:15'])
  const continuous = parseOpeningHours({ periods: [{ open: { day: 1, hour: 9, minute: 0 }, close: { day: 5, hour: 17, minute: 0 } }] })
  const closure = parseSpecialHours([{ kind: 'closure', starts_on: '2099-01-06', ends_on: '2099-01-06', note: null }])
  assert.equal(generateReservationTimes(continuous, '2099-01-07', { specialHours: closure }).length, 48)
})
