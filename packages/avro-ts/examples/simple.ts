import { toTypeScript } from '@marciopd/avro-ts';
import { Schema } from 'avsc';

const avro: Schema = {
  type: 'record',
  name: 'User',
  fields: [
    { name: 'id', type: 'int' },
    { name: 'username', type: 'string' },
  ],
};

const ts = toTypeScript(avro);

console.log(ts);
