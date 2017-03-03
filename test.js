'use strict';

const junit   = require('junit');
const disq    = require('./disq');
const it      = junit();
const eq      = it.eq;
const NODES   = [ '127.0.0.1:7711' ];
const CYCLE   = 5;
const OPTIONS = { cycle: CYCLE };
const disque  = new disq.Disq({ nodes: NODES });

(async () => {
  it('addjob', async () => {
    const addrep = await new junit.Promise((resolve, reject) => {
      disque.addjob('q1', 'j1', (x1) => {
        resolve(x1);
      }, e => {
        reject(e);
      });
    });
    return eq(addrep.startsWith('D-'), true);
  });

  it('getjob', async () => {
    const getrep = await new junit.Promise((resolve, reject) => {
      disque.getjob('q1', (jobs) => {
        resolve(jobs);
      }, e => {
        reject(e);
      });
    });
    return eq(getrep.length, 1)
      & eq(getrep[0].queue, 'q1')
      & eq(getrep[0].id.startsWith('D-'), true)
      & eq(getrep[0].body, 'j1');
  });

  it('ackjob', async () => {
    const oldlen = await new junit.Promise((resolve, reject) => {
      disque.qlen('q1', (job) => {
        resolve(job);
      }, e => {
        reject(e);
      });
    });
    const qpeekrep = await new junit.Promise((resolve, reject) => {
      disque.qpeek('q1', 1, (job) => {
        resolve(job);
      }, e => {
        reject(e);
      });
    });
    const ackrep = await new junit.Promise((resolve, reject) => {
      disque.ackjob(qpeekrep[0].id, (jobs) => {
        resolve(jobs);
      }, e => {
        reject(e);
      });
    });
    const newlen = await new junit.Promise((resolve, reject) => {
      disque.qlen('q1', (job) => {
        resolve(job);
      }, e => {
        reject(e);
      });
    });
    return eq(oldlen - newlen, 1);
  });

  it.run().then(() => {
    disque.end();
  }).catch(e => {
    console.log(e.stack);
    disque.end();
  });
})();
