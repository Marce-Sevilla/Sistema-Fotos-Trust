import assert from 'node:assert/strict';
import { extractOdometer, extractVin, vinChecksumValid } from '../src/validation/ocr-rules.js';

const t = (name, fn) => {
  fn();
  console.log('ok  -', name);
};
// Una lÃ­nea de OCR a partir de "palabra:confianza" separadas por espacios (confianza 90 por defecto).
const line = (spec) => ({
  words: spec.split(' ').map((w) => {
    const [text, conf] = w.split(':');
    return { text, confidence: conf === undefined ? 90 : Number(conf) };
  }),
});

t('checksum vÃ¡lido (dÃ­gito X)', () => assert.equal(vinChecksumValid('1M8GDM9AXKP042788'), true));
t('checksum vÃ¡lido (todo 1)', () => assert.equal(vinChecksumValid('11111111111111111'), true));
t('checksum invÃ¡lido (un carÃ¡cter cambiado)', () => assert.equal(vinChecksumValid('1M8GDM9AXKP042789'), false));
t('checksum rechaza letras prohibidas', () => assert.equal(vinChecksumValid('1M8GDM9AXKP04278O'), false));

t('VIN limpio', () => assert.deepEqual(extractVin([line('1M8GDM9AXKP042788')]), { vin: '1M8GDM9AXKP042788', checksumOk: true }));
t('VIN en grupos separados', () => assert.equal(extractVin([line('1M8G DM9A XKP0 42788')]).vin, '1M8GDM9AXKP042788'));
t('VIN con O leÃ­da en lugar de 0 se corrige', () => assert.equal(extractVin([line('1M8GDM9AXKPO42788')]).vin, '1M8GDM9AXKP042788'));
t('VIN con un error de OCR se marca dudoso', () => assert.deepEqual(extractVin([line('1M8GDM9AXKP042789')]), { vin: '1M8GDM9AXKP042789', checksumOk: false }));
t('la confianza reportada no cuenta para el VIN', () => assert.equal(extractVin([line('1M8GDM9AXKP042788:9')]).vin, '1M8GDM9AXKP042788'));
t('encuentra el VIN aunque la lÃ­nea traiga etiquetas', () => assert.equal(extractVin([line('VIN: 1M8GDM9AXKP042788 MADE IN USA')]).vin, '1M8GDM9AXKP042788'));
t('VIN dudoso en grupos no se acepta (solo palabra Ãºnica)', () => assert.equal(extractVin([line('1M8G DM9A XKP0 42789')]), null));
t('VIN dudoso sin letras suficientes no se acepta', () => assert.equal(extractVin([line('12345678901234567')]), null));
t('texto sin VIN', () => assert.equal(extractVin([line('HELLO WORLD 123')]), null));
t('sin lÃ­neas', () => assert.equal(extractVin([]), null));
// Antes, cadenas basura largas "encontraban" un VIN vÃ¡lido por azar (1 de cada 11 ventanas cumple el checksum).
t('basura larga no genera VIN', () => {
  const garbage = [line('STLFNLPERR25SELRATAHEERC'), line('JJJPYWWVYJTF0JV24VVPASRLERV'), line('4RE A RL WEL BR A P RE 3 R L JA LRN STN A RA HP N 5 8 3 RPE TR SS PAR')];
  assert.equal(extractVin(garbage), null);
});

t('odÃ³metro simple', () => assert.deepEqual(extractOdometer([line('087654')]), { reading: '087654' }));
t('odÃ³metro con coma de miles', () => assert.deepEqual(extractOdometer([line('87,654')]), { reading: '87654' }));
t('ignora nÃºmeros de la escala del velocÃ­metro', () => assert.equal(extractOdometer([line('20 40 60 80 100 120 140')]), null));
t('ignora lecturas de baja confianza', () => assert.equal(extractOdometer([line('1707:0 10000:0')]), null));
t('letra O leÃ­da en lugar de cero', () => assert.equal(extractOdometer([line('O87654')]).reading, '087654'));
t('ignora el parcial con decimales', () => assert.equal(extractOdometer([line('123.4')]), null));
t('elige el kilometraje total sobre otras cifras', () => assert.equal(extractOdometer([line('123456'), line('0123')]).reading, '123456'));
t('sin lÃ­neas', () => assert.equal(extractOdometer([]), null));

