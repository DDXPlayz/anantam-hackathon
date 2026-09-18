// LUMA experiment registry — metadata shared by the landing page and the laboratory.
// Engines are loaded lazily from ./experiments/<id>.js when an experiment is opened.
export const SUBJECTS = [
  { id: 'physics', label: 'Physics' },
  { id: 'electronics', label: 'Electronics' },
  { id: 'chemistry', label: 'Chemistry' },
];

export const EXPERIMENTS = [
  { id: 'projectile', subject: 'physics', title: 'Projectile Motion', difficulty: 1,
    blurb: 'Launch a ball with adjustable speed, angle, height and gravity. Add air drag and watch the analytic prediction fail.',
    measures: 'range, max height, time of flight' },
  { id: 'pendulum', subject: 'physics', title: 'Simple Pendulum', difficulty: 2,
    blurb: 'Full nonlinear pendulum with damping. Compare the measured period with 2π√(L/g) and see the small-angle approximation break down.',
    measures: 'period, g, amplitude dependence' },
  { id: 'ohm', subject: 'physics', title: "Ohm's Law", difficulty: 1,
    blurb: 'Vary the supply voltage across a resistor chain and read the current on a meter with real resolution limits. Fit the V–I line.',
    measures: 'current, V–I slope, resistance' },
  { id: 'refraction', subject: 'physics', title: 'Refraction & Snell’s Law', difficulty: 2,
    blurb: 'Trace a beam across an interface between two media. Find the critical angle, observe total internal reflection, fit sin i against sin r.',
    measures: 'refracted angle, refractive index' },
  { id: 'series', subject: 'electronics', title: 'Series Circuit', difficulty: 1,
    blurb: 'Build a chain of one to four resistors. Measure the current and the voltage across each element against Kirchhoff’s predictions.',
    measures: 'total resistance, current, voltage drops' },
  { id: 'parallel', subject: 'electronics', title: 'Parallel Circuit', difficulty: 2,
    blurb: 'Add up to four branches and measure how the supply current divides. Verify the reciprocal-sum rule with noisy ammeters.',
    measures: 'branch currents, equivalent resistance' },
  { id: 'led', subject: 'electronics', title: 'LED Circuit', difficulty: 2,
    blurb: 'Drive an LED through a series resistor using a real diode equation. Pick a resistor to hit a target current without exceeding the maximum.',
    measures: 'forward current, brightness, safe resistor' },
  { id: 'reaction', subject: 'chemistry', title: 'Reaction Rate', difficulty: 3,
    blurb: 'Arrhenius kinetics with adjustable concentration, temperature, activation energy and a catalyst switch. Find the reaction order from data.',
    measures: 'initial rate, rate constant, order' },
  { id: 'gas', subject: 'chemistry', title: 'Gas Laws', difficulty: 2,
    blurb: 'A piston-and-cylinder with n, T, V and P. Isothermal, isobaric and isochoric processes; ideal versus van der Waals behaviour.',
    measures: 'pressure, volume, PV/nRT' },
];

export const byId = Object.fromEntries(EXPERIMENTS.map(e => [e.id, e]));
export const DIFFICULTY = ['', 'Introductory', 'Intermediate', 'Advanced'];
