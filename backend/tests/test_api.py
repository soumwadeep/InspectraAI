"""HTTP-level guarantees: tenant isolation, path containment, state guards."""
from __future__ import annotations

import cv2
import numpy as np
import pytest

from app.core.storage import StorageService
from app.models.equipment import Equipment, EquipmentReferenceImage
from app.models.inspection import Inspection, InspectionInput
from app.models.ticket import MaintenanceTicket, TicketStatusEnum
from app.models.user import Organization
from app.vision.benchmark import draw_panel, inject_defect


class TestPathContainment:
    """`UPLOAD_DIR.parent / stored_path` with an attacker-influenced path escapes
    the storage tree; every file endpoint would then serve the target."""

    @pytest.mark.parametrize(
        "escaped",
        [
            "../../etc/passwd",
            "/etc/passwd",
            "uploads/../../backend/app/config.py",
            "uploads/evidence/../../../etc/hosts",
            "..",
            ".",
            "",
        ],
    )
    def test_escaped_paths_never_resolve_outside_storage(self, escaped):
        assert StorageService.resolve_within_storage(escaped) is None

    @pytest.mark.parametrize("escaped", ["../../etc/passwd", "/etc/passwd", "../.env"])
    def test_escaped_paths_never_return_bytes(self, escaped):
        assert StorageService.read_image_as_bytes(escaped) is None

    def test_a_real_stored_file_still_reads(self, storage_dir):
        relative = "uploads/reference/x/panel.png"
        path = storage_dir / "uploads/reference/x/panel.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(path), draw_panel(np.random.default_rng(1)))
        assert StorageService.read_image_as_bytes(relative) is not None


class TestTenantIsolation:
    def test_input_preview_rejects_another_organizations_upload(self, client, db, admin):
        """The lookup used to be by input id alone, so any authenticated caller
        could read another tenant's upload by supplying a matching inspection id."""
        other = Organization(name="Other Works", slug="other-works")
        db.add(other)
        db.flush()
        equipment = Equipment(
            organization_id=other.id, name="Pump", category="pump", location="Yard"
        )
        db.add(equipment)
        db.flush()
        inspection = Inspection(
            equipment_id=equipment.id,
            organization_id=other.id,
            inspector_id=admin.id,
        )
        db.add(inspection)
        db.flush()
        stored = InspectionInput(
            inspection_id=inspection.id,
            input_type="image",
            filename="secret.png",
            storage_path="uploads/inspections/other/secret.png",
            file_size_bytes=1,
            metadata_json={},
        )
        db.add(stored)
        db.commit()

        response = client.get(
            f"/api/inspections/{inspection.id}/input/{stored.id}/preview"
        )
        assert response.status_code == 404, response.text

    def test_frames_rejects_another_organizations_inspection(self, client, db, admin):
        other = Organization(name="Frames Other", slug="frames-other")
        db.add(other)
        db.flush()
        equipment = Equipment(
            organization_id=other.id, name="Valve", category="valve", location="Yard"
        )
        db.add(equipment)
        db.flush()
        inspection = Inspection(
            equipment_id=equipment.id,
            organization_id=other.id,
            inspector_id=admin.id,
        )
        db.add(inspection)
        db.commit()

        response = client.get(f"/api/inspections/{inspection.id}/frames")
        assert response.status_code == 404, response.text


class TestTicketTransitionGuard:
    def _ticket(self, db, admin, status: TicketStatusEnum) -> MaintenanceTicket:
        # The ticket must live in the caller's own organization: the endpoint scopes
        # by org, so a ticket anywhere else correctly answers 404, not 409.
        organization = db.get(Organization, admin.organization_id)
        equipment = Equipment(
            organization_id=organization.id,
            name="Compressor",
            category="compressor",
            location="Bench",
        )
        db.add(equipment)
        db.flush()  # assigns equipment.id

        # Constructed only after the flush: the constructor reads equipment.id.
        finding_owner = Inspection(
            equipment_id=equipment.id,
            organization_id=organization.id,
            inspector_id=admin.id,
        )
        db.add(finding_owner)
        db.flush()
        from app.models.finding import Finding, FindingStatusEnum, SeverityEnum, VerificationStatusEnum

        finding = Finding(
            equipment_id=equipment.id,
            inspection_id=finding_owner.id,
            organization_id=organization.id,
            category="discoloration",
            description="test",
            detection_method="test",
            confidence=0.5,
            severity=SeverityEnum.warning,
            verification_status=VerificationStatusEnum.unverified,
            resolution_state=FindingStatusEnum.pending_review,
        )
        db.add(finding)
        db.flush()
        ticket = MaintenanceTicket(
            equipment_id=equipment.id,
            finding_id=finding.id,
            organization_id=organization.id,
            priority="high",
            description="test ticket",
            status=status,
        )
        db.add(ticket)
        db.commit()
        return ticket

    def test_cannot_close_a_ticket_that_was_never_verified(self, client, db, admin):
        ticket = self._ticket(db, admin, TicketStatusEnum.awaiting_approval)
        response = client.patch(
            f"/api/tickets/{ticket.id}", json={"status": "closed"}
        )
        assert response.status_code == 409, response.text
        assert "awaiting-approval" in response.text and "closed" in response.text

    def test_a_legal_transition_still_succeeds(self, client, db, admin):
        ticket = self._ticket(db, admin, TicketStatusEnum.awaiting_approval)
        response = client.patch(f"/api/tickets/{ticket.id}", json={"status": "open"})
        assert response.status_code == 200, response.text
        assert response.json()["status"] == "open"

    def test_closed_is_terminal(self, client, db, admin):
        ticket = self._ticket(db, admin, TicketStatusEnum.closed)
        response = client.patch(
            f"/api/tickets/{ticket.id}", json={"status": "in-progress"}
        )
        assert response.status_code == 409, response.text

    def test_an_unknown_status_is_a_clean_400_not_a_500(self, client, db, admin):
        """`TicketStatusEnum("in_progress")` raises; that must not escape the handler."""
        ticket = self._ticket(db, admin, TicketStatusEnum.awaiting_approval)
        response = client.patch(
            f"/api/tickets/{ticket.id}", json={"status": "in_progress"}
        )
        assert response.status_code == 400, response.text
        assert "not a ticket status" in response.text


class TestCapabilitiesEndpoint:
    def test_reports_unimplemented_features_as_unimplemented(self, client):
        body = client.get("/api/system/capabilities").json()
        by_name = {feature["name"]: feature for feature in body["features"]}
        # These do not exist. If someone later builds them, this assertion is the
        # prompt to update the list deliberately rather than let the UI drift.
        for absent in (
            "per_frame_defect_tracking",
            "live_camera_input",
            "language_model_planner",
            "real_world_accuracy_claim",
        ):
            assert by_name[absent]["implemented"] is False, absent
        assert body["integrations"]["aws_worker"] is False
        assert body["integrations"]["cool_integration"] is False
        assert body["queue"]["instrumented"] is False

    def test_opencv_version_matches_the_imported_module(self, client):
        import cv2

        body = client.get("/api/system/capabilities").json()
        assert body["opencv"]["version"] == cv2.__version__


class TestAuthEndpoints:
    def test_first_registrant_becomes_administrator(self, client, db):
        response = client.post(
            "/api/auth/register",
            json={
                "email": "first-capability@example.com",
                "password": "a-long-enough-password",
                "name": "First User",
                "organization_name": "First Org",
            },
        )
        assert response.status_code in (201, 400), response.text
        if response.status_code == 201:
            assert response.json()["user"]["role"] == "administrator"

    def test_health_reports_the_real_schema_revision(self, client):
        body = client.get("/health").json()
        assert body["schema_revision"], "revision must come from Alembic, not a constant"


class TestBenchmarkShapeConsistency:
    def test_list_and_detail_return_the_same_fields(self, client):
        """One resource, one shape. The detail route used to hand-build
        `config`/`results` while the list returned `config_json`/`results_json`,
        so the client adapter silently rendered every stored measurement empty."""
        started = client.post(
            "/api/benchmarks/run",
            json={"name": "shape check", "description": "", "config": {"pairs": 2, "seed": 5}},
        )
        assert started.status_code == 200, started.text
        run_id = started.json()["id"]

        listed = client.get("/api/benchmarks").json()
        row = next(item for item in listed if item["id"] == run_id)
        detail = client.get(f"/api/benchmarks/{run_id}").json()

        assert row.keys() == detail.keys(), (sorted(row), sorted(detail))
        assert "results_json" in detail
        assert detail["results_json"]["detection"]["true_positives"] >= 0
        # The corpus metadata must survive, or the numbers are unattributable.
        for key in ("pairs", "seed", "iou_threshold"):
            assert key in detail["results_json"]["corpus"], key


class TestDatabaseUrlScheme:
    """Coolify hands out `postgres://`, which SQLAlchemy 2.0 cannot load — the
    container died on startup with
    `NoSuchModuleError: Can't load plugin: sqlalchemy.dialects:postgres`."""

    def test_coolify_scheme_is_rewritten_to_one_sqlalchemy_can_load(self):
        from app.config import Settings

        rewritten = Settings(
            database_url="postgres://u:p%40ss@dbhost:5432/inspectraaidb"
        ).database_url
        assert rewritten.startswith("postgresql://")
        # The percent-encoded password must survive untouched: decoding it here
        # would break the very URL this exists to fix.
        assert "p%40ss" in rewritten

    def test_explicit_driver_choices_are_left_alone(self):
        from app.config import Settings

        for url in (
            "postgresql+psycopg2://u:p@h:5432/d",
            "postgresql+asyncpg://u:p@h:5432/d",
            "sqlite:///inspectra.db",
        ):
            assert Settings(database_url=url).database_url == url

    def test_the_rewritten_url_builds_a_real_engine(self):
        from sqlalchemy.engine import create_engine, make_url

        from app.config import Settings

        settings = Settings(
            database_url="postgres://u:p%40ss@h:5432/inspectraaidb"
        )
        url = make_url(settings.database_url)
        assert url.drivername == "postgresql"
        # Dialect resolution is what crashed; building the URL object does not
        # connect, so this stays a unit test with no database required.
        assert create_engine(settings.database_url).dialect.name == "postgresql"


class TestOrganizationReport:
    """The report replaced browser-side tallying of capped list endpoints. Two
    properties matter and neither is checked anywhere else: it must count every
    row in the organization (not a page of them), and it must not count rows
    belonging to another tenant."""

    def _seed(self, db, admin, *, org_id=None, inspections=0, findings=0):
        org_id = org_id or admin.organization_id
        equipment = Equipment(
            organization_id=org_id, name="Asset", category="pump", location="Yard"
        )
        db.add(equipment)
        db.flush()
        created = []
        for _ in range(inspections):
            inspection = Inspection(
                equipment_id=equipment.id,
                organization_id=org_id,
                inspector_id=admin.id,
                duration_ms=200,
            )
            db.add(inspection)
            db.flush()
            created.append(inspection)
        from app.models.finding import Finding, FindingStatusEnum, SeverityEnum, VerificationStatusEnum

        for inspection in created[:findings]:
            db.add(Finding(
                inspection_id=inspection.id,
                equipment_id=equipment.id,
                organization_id=org_id,
                category="discoloration",
                severity=SeverityEnum.warning,
                verification_status=VerificationStatusEnum.unverified,
                resolution_state=FindingStatusEnum.pending_review,
                description="measured",
                detection_method="change_detection",
                confidence=0.7,
            ))
        db.commit()
        return equipment

    def test_counts_every_row_not_a_page_of_them(self, client, db, admin):
        # 60 is past the 50-row cap on GET /api/inspections; a browser-tallied
        # report would have reported 50 and looked complete.
        self._seed(db, admin, inspections=60, findings=3)

        body = client.get("/api/reports/organization").json()
        assert body["inspections"]["total"] == 60, body["inspections"]
        assert body["findings"]["total"] == 3

    def test_another_tenants_rows_never_appear(self, client, db, admin):
        other = Organization(name="Report Other", slug="report-other")
        db.add(other)
        db.flush()
        self._seed(db, admin, inspections=2)
        self._seed(db, admin, org_id=other.id, inspections=9)

        body = client.get("/api/reports/organization").json()
        assert body["inspections"]["total"] == 2, body["inspections"]

    def test_histograms_carry_enum_values_not_python_names(self, client, db, admin):
        self._seed(db, admin, inspections=4, findings=2)
        body = client.get("/api/reports/organization").json()
        # `pending_review` is the member name; the column stores `pending-review`.
        assert body["findings"]["by_resolution"] == {"pending-review": 2}

    def test_the_window_excludes_rows_outside_it(self, client, db, admin):
        from datetime import datetime, timedelta

        equipment = self._seed(db, admin, inspections=1)
        db.add(Inspection(
            equipment_id=equipment.id,
            organization_id=admin.organization_id,
            inspector_id=admin.id,
            started_at=datetime.utcnow() - timedelta(days=400),
            duration_ms=100,
        ))
        db.commit()

        all_rows = client.get("/api/reports/organization").json()
        last_30 = client.get("/api/reports/organization?days=30").json()
        assert all_rows["inspections"]["total"] == 2
        assert last_30["inspections"]["total"] == 1
        assert last_30["scope"]["window_days"] == 30

    def test_the_scope_names_the_caller_and_the_aggregation(self, client, db, admin):
        body = client.get("/api/reports/organization").json()
        assert body["scope"]["assembled_by"] == "server"
        assert body["scope"]["requested_by"] == admin.email
        assert body["scope"]["organization_id"] == admin.organization_id
