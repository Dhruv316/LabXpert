import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { expectNoLeaks, findLeaks, readableText, type LeakKind } from './leaks';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

const kinds = (text: string): LeakKind[] => findLeaks(text).map((leak) => leak.kind);

function box(html: string): HTMLElement {
  const element = document.createElement('div');
  element.innerHTML = html;
  document.body.append(element);
  return element;
}

describe('expectNoLeaks: clean text', () => {
  it('passes ordinary student text, units and numbers', () => {
    const clean = box(
      '<h1>Choose an experiment</h1><p>Hello, Asha</p><p>Current is 0.60 A at 6 V. Resistance: 10 Ω.</p><p>Don’t connect the ammeter in parallel; e.g. use R1 and R2.</p>',
    );
    expect(() => expectNoLeaks(clean)).not.toThrow();
    expect(findLeaks('Series and parallel resistors. Ohm’s Law.')).toEqual([]);
  });

  it('does not flag words that merely contain a flagged word', () => {
    expect(findLeaks('The nanny, a banana and a nanometre.')).toEqual([]);
    expect(findLeaks('A word like undefinedly is not the word undefined.').map((l) => l.found)).toEqual(['undefined']);
  });
});

describe('expectNoLeaks: each kind of leak is caught', () => {
  it('a rule code, error or OK', () => {
    expect(kinds('Problem: AMMETER_PARALLEL')).toContain('rule code');
    expect(kinds('OK_CIRCUIT_COMPLETE')).toContain('rule code');
    expect(kinds('OPEN_CIRCUIT')).toContain('rule code');
  });

  it('a code that is not in the specs yet, by its shape', () => {
    expect(findLeaks('Oops: BRAND_NEW_CODE')).toEqual([{ kind: 'rule code', found: 'BRAND_NEW_CODE' }]);
  });

  it('a feedback key shaped like CODE.suffix', () => {
    expect(findLeaks('See OPEN_CIRCUIT.gap now').map((l) => l.kind)).toContain('feedback key');
    expect(findLeaks('See SOME_CODE.fix now').map((l) => l.kind)).toContain('feedback key');
    expect(findLeaks('See ANYTHING.title now').map((l) => l.kind)).toContain('feedback key');
  });

  it('a text key from the ui strings', () => {
    expect(findLeaks('picker.hello')).toEqual([{ kind: 'text key', found: 'picker.hello' }]);
    expect(findLeaks('Status: picker.status.done!')).toEqual([{ kind: 'text key', found: 'picker.status.done' }]);
  });

  it('a raw experiment id and a raw task id', () => {
    expect(findLeaks('Opening ohms-law')).toEqual([{ kind: 'raw id', found: 'ohms-law' }]);
    expect(findLeaks('series-parallel')).toEqual([{ kind: 'raw id', found: 'series-parallel' }]);
    expect(findLeaks('Task practice-fix-open-circuit')).toEqual([{ kind: 'raw id', found: 'practice-fix-open-circuit' }]);
  });

  it('an object-like string', () => {
    expect(findLeaks('Name: [object Object]')).toEqual([{ kind: 'object text', found: '[object Object]' }]);
  });

  it('the word undefined and NaN', () => {
    expect(findLeaks('Hello, undefined')).toEqual([{ kind: 'undefined', found: 'undefined' }]);
    expect(findLeaks('Current: NaN A')).toEqual([{ kind: 'NaN', found: 'NaN' }]);
  });

  it('fails the test through expectNoLeaks, for visible text', () => {
    expect(() => expectNoLeaks(box('<p>Hello, undefined</p>'))).toThrow();
    expect(() => expectNoLeaks(box('<p>OPEN_CIRCUIT</p>'))).toThrow();
  });
});

describe('expectNoLeaks: where it looks', () => {
  it('reads text that sits in neighbouring elements as separate words', () => {
    expect(readableText(box('<p>Hi</p><p>NaN</p>'))).toContain('Hi\nNaN');
    expect(() => expectNoLeaks(box('<b>Value</b><i>NaN</i>'))).toThrow();
  });

  it('also reads what a screen reader says: aria-label, title, alt, placeholder', () => {
    for (const attribute of ['aria-label', 'title', 'alt', 'placeholder']) {
      const element = box(`<button ${attribute}="AMMETER_PARALLEL">ok</button>`);
      expect(() => expectNoLeaks(element)).toThrow();
    }
  });

  it('ignores internal attributes such as ids, classes and data attributes', () => {
    const element = box('<article id="experiment-ohms-law" class="OPEN_CIRCUIT" data-code="OPEN_CIRCUIT"><h2>Ohm’s Law</h2></article>');
    expect(() => expectNoLeaks(element)).not.toThrow();
  });
});
