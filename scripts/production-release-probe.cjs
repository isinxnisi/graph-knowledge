const {createHash} = require('node:crypto');
const http = require('node:http');

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function get(path) {
  return new Promise((resolve, reject) => {
    // The production read guard checks Host even over the container loopback.
    const request = http.get({host: '127.0.0.1', port: 3000, path, headers: {host: 'plunode.net'}}, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('error', reject);
      response.on('end', () => {
        try {
          if (response.statusCode !== 200) throw Error(path.split('&')[0] + ' HTTP ' + response.statusCode);
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.setTimeout(25000, () => request.destroy(Error('Public read timed out')));
    request.on('error', reject);
  });
}

function publication(query) {
  return get('/api/knowledge/public?' + new URLSearchParams(query));
}

async function probe() {
  const before = JSON.parse(process.argv[1] || 'null');
  const dataset = await get('/api/dataset');
  const status = await publication({mode: 'status'});
  if (dataset.dataset !== 'public-kg' || !status.active?.id) throw Error('Published dataset unavailable');

  const first = await publication({mode: 'search', limit: 2});
  if (first.records.length !== 2 || !first.nextCursor) throw Error('First search page unavailable');
  const second = await publication({mode: 'search', limit: 2, cursor: first.nextCursor});
  if (second.records.length !== 2 || first.generation !== second.generation) throw Error('Search pagination unavailable');

  const sample = [...first.records, ...second.records].find(item => item.record.content.kind === 'relation');
  if (!sample) throw Error('Representative published relation unavailable');
  const {id, revision, content} = sample.record;
  const direct = await publication({mode: 'record-version', recordId: id, revision});
  const adjacent = await publication({mode: 'neighbors', entityId: content.subjectId, limit: 2, generation: first.generation});
  if (direct.record.record.id !== id || !direct.record.sources.length || !adjacent.records.length) {
    throw Error('Published version, evidence or Graph neighbors unavailable');
  }

  if (before) {
    const oldPage = await publication({mode: 'search', limit: 2, cursor: before.cursor});
    const fixed = await publication({mode: 'record-version', recordId: before.recordId, revision: before.recordRevision});
    if (oldPage.generation !== before.generation || hash(oldPage.records) !== before.secondPageHash ||
        hash(fixed) !== before.fixedHash) {
      throw Error('Prior search cursor or fixed Record revision changed');
    }
  }
  console.log(JSON.stringify({generation: first.generation, cursor: first.nextCursor,
    secondPageHash: hash(second.records), recordId: id, recordRevision: revision, fixedHash: hash(direct)}));
}

probe().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
