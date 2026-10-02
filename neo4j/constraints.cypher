CREATE CONSTRAINT entity_id IF NOT EXISTS FOR (n:Entity) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT claim_id IF NOT EXISTS FOR (n:Claim) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT source_id IF NOT EXISTS FOR (n:Source) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT citation_id IF NOT EXISTS FOR (n:Citation) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT external_identifier_id IF NOT EXISTS FOR (n:ExternalIdentifier) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT external_identifier_key IF NOT EXISTS FOR (n:ExternalIdentifier) REQUIRE (n.namespace, n.value) IS UNIQUE;
