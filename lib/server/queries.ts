// All request values are passed as parameters. No user value is interpolated.
export const SEARCH_ENTITIES = `
MATCH (e:Entity)
WHERE e.kind = 'person' AND any(name IN e.searchNames WHERE name CONTAINS $q)
WITH e, CASE WHEN $q IN e.searchNames THEN 0 ELSE 1 END AS rank
RETURN properties(e) AS entity
ORDER BY rank, e.name, e.id LIMIT $take`;

export const ENTITY_DETAIL = `
MATCH (e:Entity {id: $id}) RETURN properties(e) AS entity`;

export const NEIGHBORS = `
MATCH (:Entity {id: $id})<-[:SUBJECT|OBJECT]-(c:Claim)
WHERE c.visibility = 'published' AND ($predicates IS NULL OR c.predicate IN $predicates)
  AND ($after IS NULL OR c.id > $after)
WITH DISTINCT c ORDER BY c.id LIMIT $take
MATCH (c)-[:SUBJECT]->(subject:Entity), (c)-[:OBJECT]->(object:Entity)
OPTIONAL MATCH (c)-[:HAS_CITATION]->(:Citation)-[:CITES]->(source:Source)
RETURN properties(c) AS claim, properties(subject) AS subject,
       properties(object) AS object, count(DISTINCT source) AS sourceCount
ORDER BY claim.id`;

// Role無条件は従来のquery planを再利用。条件ありだけ限定をLIMIT前へ加える。
export const NEIGHBORS_BY_ROLE = NEIGHBORS.replace("  AND ($after", "  AND (c.predicate <> 'CONTRIBUTED_TO' OR c.contributionRoleId IN $contributionRoles)\n  AND ($after");

export const CLAIM_DETAIL = `
MATCH (c:Claim {id: $id})-[:SUBJECT]->(subject:Entity), (c)-[:OBJECT]->(object:Entity)
WHERE c.visibility = 'published'
OPTIONAL MATCH (c)-[:HAS_CITATION]->(citation:Citation)-[:CITES]->(source:Source)
WITH c, subject, object, citation, source ORDER BY citation.id
RETURN properties(c) AS claim, properties(subject) AS subject, properties(object) AS object,
       count(DISTINCT source) AS sourceCount,
       collect(CASE WHEN citation IS NULL THEN null
                    ELSE {citation: properties(citation), source: properties(source)} END) AS citations`;

export const RELATED_CLAIMS = `
MATCH (related:Claim)-[:SUBJECT]->(:Entity {id: $subjectId}),
      (related)-[:OBJECT]->(:Entity {id: $objectId})
WHERE related.visibility = 'published' AND related.predicate = $predicate AND related.id <> $id
RETURN DISTINCT related.id AS id ORDER BY id`;

// 各視点で同じClaimを一度だけ数える。CitationへのJOIN・取得条件・LIMITはない。
export const ENTITY_OVERVIEW = `
MATCH (:Entity {id: $id})<-[side:SUBJECT|OBJECT]-(c:Claim)
WHERE c.visibility = 'published'
WITH DISTINCT c, type(side) AS side
RETURN c.predicate AS predicate, toLower(side) AS perspective,
       c.polarity AS polarity, c.contributionRoleId AS roleId,
       count(DISTINCT c.id) AS count
ORDER BY predicate, perspective, roleId, polarity`;
