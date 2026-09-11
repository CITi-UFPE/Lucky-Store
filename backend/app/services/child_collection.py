"""Synchronize submitted children inside the caller's transaction (never commit)."""
import json

from app.models.audit_log import AuditLog, AuditAction
from app.models.status_history import StatusHistory, EntityType


def sync_children(db, parent_id, model, parent_field, submitted, entity_type, user_id):
    existing = {
        row.id: row for row in db.query(model).filter(
            getattr(model, parent_field) == parent_id
        ).all()
    }
    ids = [item.id for item in submitted]
    if len(ids) != len(set(ids)):
        raise ValueError("Há itens duplicados no salvamento")

    # Validate ownership before changing or deleting anything. Client UUIDs make
    # resubmitting a PUT after a lost response safe for newly added children too.
    for item in submitted:
        if item.id not in existing and db.get(model, item.id) is not None:
            raise ValueError("O item informado pertence a outro registro")

    for item in submitted:
        values = item.model_dump(exclude_unset=True, exclude={'id'})
        row = existing.get(item.id)
        # Editing the OS's commercial fields must not reassign the seller who
        # originally owned a product. ProdutoCreate requires it for new rows.
        if row is not None and entity_type == 'produto':
            values.pop('id_vendedor', None)
        old_status = getattr(row, 'status', None)
        if row is None:
            # Apply schema defaults for a new row (e.g. "To Buy"), but never
            # overwrite fields omitted from an existing row with defaults.
            values = item.model_dump(exclude={'id'})
            row = model(id=item.id, **{parent_field: parent_id}, **values)
            db.add(row)
            action, old = AuditAction.CREATE, None
        else:
            old = {key: getattr(row, key) for key in values}
            if old == values:
                continue
            for key, value in values.items():
                setattr(row, key, value)
            action = AuditAction.UPDATE
        db.add(AuditLog(
            entity_type=entity_type, entity_id=item.id, action=action,
            changed_by=user_id,
            old_values=json.loads(json.dumps(old, default=str)) if old else None,
            new_values=json.loads(json.dumps(values, default=str)),
        ))
        if entity_type == 'produto' and ('status' in values or action == AuditAction.CREATE):
            new_status = values.get('status', 'To Buy')
            if old_status != new_status:
                db.add(StatusHistory(
                    entity_type=EntityType.PRODUTO, entity_id=item.id,
                    old_status=old_status, new_status=new_status, changed_by=user_id,
                ))

    for item_id, row in existing.items():
        if item_id not in ids:
            db.add(AuditLog(
                entity_type=entity_type, entity_id=item_id, action=AuditAction.DELETE,
                changed_by=user_id, old_values={'id': str(item_id)},
            ))
            db.delete(row)
