import { Schema as S } from "effect";
import type { HyperedgeEncoding } from "./Hyperedge.js";

export class DocumentEncoding
  extends S.Class<DocumentEncoding>("DocumentEncoding")({
    atoms: S.Tuple(S.String, S.String, S.Number),
  })
  implements HyperedgeEncoding
{
  readonly _tag = "DocumentEncoding" as const;
}

export class EvidenceEncoding
  extends S.Class<EvidenceEncoding>("EvidenceEncoding")({
    atoms: S.Tuple(S.String, S.String, S.Number),
  })
  implements HyperedgeEncoding
{
  readonly _tag = "EvidenceEncoding" as const;
}

export class TraitEncoding
  extends S.Class<TraitEncoding>("TraitEncoding")({
    atoms: S.Tuple(S.String, S.String, S.String),
  })
  implements HyperedgeEncoding
{
  readonly _tag = "TraitEncoding" as const;
}

export class EntityEncoding
  extends S.Class<EntityEncoding>("EntityEncoding")({
    atoms: S.Tuple(S.String, S.Array(S.String)),
  })
  implements HyperedgeEncoding
{
  readonly _tag = "EntityEncoding" as const;
}

export class OntologyEncoding
  extends S.Class<OntologyEncoding>("OntologyEncoding")({
    atoms: S.Tuple(S.String, S.Array(S.String)),
  })
  implements HyperedgeEncoding
{
  readonly _tag = "OntologyEncoding" as const;
}
