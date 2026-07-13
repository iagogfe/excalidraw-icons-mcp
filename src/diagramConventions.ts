// Per-domain diagram conventions appended to read_diagram_guide when the
// caller passes diagramType. The LLM client identifies the diagram type from
// the user's request; this module only serves the matching convention text.

export const DIAGRAM_CONVENTIONS: Record<string, string> = {
  network: `# Network Diagram Convention

## Icons
- Use standardized icons via search_official_icon: "router", "switch network", "server", "printer", "firewall", "cloud".
- Same device role = same icon and same size (targetWidth ~80).
- De facto visual language is Cisco's: router and switch are distinct shapes — never reuse one icon for both.

## Layout
- Backbone flow left-to-right: LAN → edge (router/firewall) → ISP → internet/cloud.
- End devices (computers, printers, phones) fan out below their switch.
- Label every device below its icon (name, and IP/VLAN when relevant).

## Containers
- Draw a dashed rectangle per network segment: LAN, DMZ, VLAN, site/branch.
- External networks (internet, ISP) stay OUTSIDE any container.

## Arrows
- Plain lines (endArrowhead: null) for physical links; arrows only when direction of traffic matters.
- Label links with medium/speed when relevant ("fiber", "1 Gbps", "VPN").
- Dashed lines for wireless or VPN tunnels.`,

  'cloud-gcp': `# Google Cloud Diagram Convention

## Icons
- Official icons only: search_official_icon returns the iconify "gcp" set ("cloud dns", "compute engine", "cloud sql", "cloud storage", "cloud load balancing", "gke", "pub sub"...).
- Do NOT recolor GCP icons (multi-color official artwork). Actors (users, external systems) use generic icons in Google palette (#4285f4 blue, #ea4335 red, #34a853 green, #fbbc05 yellow).

## Containers (nesting order, max 3 levels)
1. "Google Cloud" boundary — dashed blue (#4285f4) rectangle around all GCP services.
2. Optional: project or VPC rectangle.
3. Region/zone rectangles (dashed gray #868e96) around zonal resources (Compute Engine, GKE nodes) — one box per zone to show high availability.
- Users, publishers, third-party systems stay OUTSIDE the Google Cloud boundary; arrows crossing the border = ingress/egress.

## Layout
- Flow top-to-bottom: users → DNS/LB → compute → data (Storage/SQL).
- Data services (Cloud Storage, Cloud SQL, BigQuery) at the bottom; shared services outside zone boxes.

## Arrows
- Label protocol when not obvious ("HTTPS", "gRPC", "replication").
- Dashed arrows for async flows (Pub/Sub, eventing).`,

  'cloud-aws': `# AWS Diagram Convention

## Icons
- Search official icons first ("ec2", "s3", "rds", "lambda", "api gateway"...). If the local AWS pack is not populated, simple-icons/iconify equivalents are acceptable — keep one consistent set per diagram.
- AWS palette for actors/annotations: orange #ff9900, dark blue #232f3e.

## Containers (nesting order, max 3-4 levels)
1. "AWS Cloud" boundary — dashed rectangle around all AWS services.
2. Region rectangle (dashed).
3. VPC rectangle (solid border, light fill) — mandatory whenever EC2/RDS/subnet resources appear.
4. Availability Zone rectangles (dashed) and public/private subnet rectangles (green/blue tint) inside the VPC.
- Users and external systems stay OUTSIDE the AWS Cloud boundary.

## Layout
- Flow left-to-right or top-to-bottom: users → Route53/CloudFront → ALB → compute → data stores.
- Managed regional services (S3, DynamoDB) sit inside the region but outside the VPC — this placement is meaningful, respect it.

## Arrows
- Label protocol/port when not obvious. Dashed for async (SQS, SNS, EventBridge).`,

  'cloud-azure': `# Azure Diagram Convention

## Icons
- Search official icons first ("azure app service", "azure sql", "azure functions"...). Keep one icon set per diagram; Azure blue #0078d4 for actors/annotations.

## Containers (nesting order)
1. "Azure" boundary — dashed rectangle around all Azure services.
2. Subscription / Resource Group rectangle — Azure diagrams conventionally group by resource group.
3. VNet and subnet rectangles when IaaS resources (VMs) appear.
- External users/systems stay OUTSIDE the Azure boundary.

## Layout
- Flow top-to-bottom: users → Front Door/App Gateway → compute (App Service, AKS, Functions) → data (SQL, Cosmos, Storage).

## Arrows
- Label protocol when not obvious; dashed for async (Service Bus, Event Grid).`,

  c4: `# C4 Model Convention

## Levels — ONE level per diagram, never mix
1. Context: system in the middle, people and external systems around it.
2. Container: apps/services/databases inside the system boundary.
3. Component: components inside one container.
4. Code: rarely drawn — skip unless explicitly requested.

## Shapes & colors (Structurizr palette)
- Person: 140x100 rounded rectangle (or ellipse head style), dark blue #08427b fill, white text.
- Software system (in scope): 200x100 rectangle, blue #1168bd fill, white text.
- External system: same size, gray #999999 fill.
- Container: 180x100 rectangle, lighter blue #438dd5 fill; database container as cylinder/ellipse.
- Every box gets 3 lines: Name (bold, >=18), [type/technology] (14, e.g. "[Container: Node.js]"), one-line description (14).

## Containers/boundaries
- Dashed rectangle = system boundary (Container level) or container boundary (Component level), labeled bottom-left.

## Arrows
- Every arrow MUST carry a label: action + protocol, e.g. "reads/writes [SQL/TCP]", "makes API calls [HTTPS/JSON]".
- Flow top-to-bottom: people on top, external/data systems at the bottom.`,

  erd: `# Entity-Relationship Diagram Convention (crow's foot)

## Entities
- Rectangle per entity, entity name as title (>=18, bold tone), attributes listed below (14-16), primary key first.
- Width >=180; grow height with attribute count. Same fill for all entities (light blue #a5d8ff / stroke #1971c2); junction tables with no fill.

## Relationships
- Lines between entities (endArrowhead: null); crow's foot cardinality is hard to draw natively, so ALWAYS label both ends: "1", "N", "0..1", "1..*".
- Label the relationship verb on the line ("places", "contains").
- Identifying relationships solid; non-identifying dashed.

## Layout
- Most-referenced (parent) entities top/left; children below/right.
- Avoid crossing lines — reposition entities before bending lines.
- >=80px between entities.`,

  flowchart: `# Flowchart Convention (ISO 5807)

## Shapes — meaning is fixed, do not improvise
- Ellipse/rounded: start and end (green #2f9e44 start, red #e03131 end).
- Rectangle 140x70: process step (blue #1971c2).
- Diamond 140x100: decision — exactly one question inside, outgoing arrows labeled "Yes"/"No" (or the specific values).
- Parallelogram (skewed rectangle): input/output.
- Rectangle with double side borders: predefined subprocess.

## Layout
- Single direction top-to-bottom; 60-80px vertical spacing.
- Main happy path in a straight vertical line; branches to the side, rejoining below.
- One start; one or few explicit ends.

## Arrows
- Solid, always bound (startElementId/endElementId).
- Every diamond exit labeled. Loop-backs route around the side, never through shapes.`,

  sequence: `# Sequence Diagram Convention (UML)

## Structure
- Participants as 160x60 rectangles in a row at the top; actors (people) may use a person icon.
- Lifeline: vertical dashed line from each participant to the bottom of the diagram.
- Time flows DOWN — vertical position is the message order; keep consistent spacing (>=60px between messages).

## Messages
- Sync call: solid arrow with filled head, label = method/action ("POST /orders").
- Response: dashed arrow back, label = result ("200 OK").
- Async message: solid line with open arrowhead.
- Activation: thin rectangle on the lifeline while the participant is busy (optional; skip for simple diagrams).

## Tips
- For sequence diagrams prefer create_from_mermaid ("sequenceDiagram" syntax) — Mermaid handles lifelines and spacing natively, then adjust the result.`
};

export const DIAGRAM_TYPES = Object.keys(DIAGRAM_CONVENTIONS);
