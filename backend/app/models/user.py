import enum

from sqlalchemy import Boolean, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDTimestampMixin


class UserRole(str, enum.Enum):
    """Platform roles, least to most privileged.

    - TRADER: a firm's customer; trades markets, sees their own data.
    - PROP_FIRM_ADMIN: manages one firm — its traders, branding, program.
    - SUPER_ADMIN: platform operator; manages tenants across the deployment.
    """

    TRADER = "trader"
    PROP_FIRM_ADMIN = "prop_firm_admin"
    SUPER_ADMIN = "super_admin"


class User(Base, UUIDTimestampMixin):
    __tablename__ = "users"
    # Emails are unique per firm, not globally — the same person can have
    # accounts at two different prop firms.
    __table_args__ = (UniqueConstraint("tenant_id", "email", name="uq_users_tenant_email"),)

    tenant_id: Mapped[str] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False
    )
    email: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, values_callable=lambda e: [m.value for m in e]),
        default=UserRole.TRADER,
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    tenant = relationship("Tenant", back_populates="users")
