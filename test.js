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
  it('addjob', async (after) => {
    const addrep = await new junit.Promise((resolve, reject) => {
      disque.addjob('test-addjob', 'addjob', { retry: 1 }, (x1) => {
        resolve(x1);
      }, e => {
        reject(e);
      });
    });
    const jid = addrep;
    after(() => {
      disque.ackjob(jid, () => {
      }, (e) => {
        throw e;
      })
    });
    return eq(addrep.toString().startsWith('D-'), true);
  });

  it('getjob', async (after) => {
    const addrep = await new junit.Promise((resolve, reject) => {
      disque.addjob('test-getjob', 'getjob', { retry: 1 }, (x1) => {
        resolve(x1);
      }, e => {
        reject(e);
      });
    });
    const getrep = await new junit.Promise((resolve, reject) => {
      disque.getjob('test-getjob', (jobs) => {
        resolve(jobs);
      }, e => {
        reject(e);
      });
    });
    const jid = addrep;
    after(() => {
      disque.ackjob(jid, () => {
      }, (e) => {
        throw e;
      })
    });
    return eq(getrep.length, 1)
      & eq(getrep[0].queue, 'test-getjob')
      & eq(getrep[0].id.startsWith('D-'), true)
      & eq(getrep[0].body.toString(), 'getjob');
  });

  it('ackjob', async () => {
    const addrep = await new junit.Promise((resolve, reject) => {
      disque.addjob('test-ackjob', 'ackjob', { retry: 1 }, (x1) => {
        resolve(x1);
      }, e => {
        reject(e);
      });
    });
    const oldlen = await new junit.Promise((resolve, reject) => {
      disque.qlen('test-ackjob', (job) => {
        resolve(job);
      }, e => {
        reject(e);
      });
    });
    const qpeekrep = await new junit.Promise((resolve, reject) => {
      disque.qpeek('test-ackjob', 1, (job) => {
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
      disque.qlen('test-ackjob', (job) => {
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
