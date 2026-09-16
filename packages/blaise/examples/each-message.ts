import blaise from '@marciopd/blaise'

const schema: avsc.RecordType = {
  // [...]
};
blaise({ avro: { schema }).eachMessage(); // { topic: 'aTopic', value: {} [...]}

