import argparse
import sys

from sqlalchemy.exc import IntegrityError

from app.database import SessionLocal
from app.models.nutzer import Nutzer, NutzerPfarreiRolle, PfarreiRolle
from app.models.pfarrei import Pfarrei
from app.security import hash_password
from app.services.demo_seed import seed_demo_daten
from app.services.stammdaten_seed import seed_default_stammdaten


def create_user(email: str, password: str, role: str, pfarrei: str | None) -> None:
    email = email.strip().lower()
    db = SessionLocal()
    try:
        if db.query(Nutzer).filter(Nutzer.email == email).first() is not None:
            print(f"Fehler: Nutzer mit E-Mail '{email}' existiert bereits.", file=sys.stderr)
            raise SystemExit(1)

        ist_admin = role == "admin"
        nutzer = Nutzer(email=email, password_hash=hash_password(password), ist_admin=ist_admin)
        db.add(nutzer)

        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            print(f"Fehler: Nutzer mit E-Mail '{email}' existiert bereits.", file=sys.stderr)
            raise SystemExit(1) from None

        if not ist_admin:
            if not pfarrei:
                print("Fehler: --pfarrei ist für diese Rolle erforderlich.", file=sys.stderr)
                raise SystemExit(1)
            pfarrei_obj = db.query(Pfarrei).filter(Pfarrei.name == pfarrei).first()
            if pfarrei_obj is None:
                print(f"Fehler: Pfarrei '{pfarrei}' existiert nicht.", file=sys.stderr)
                raise SystemExit(1)
            db.add(
                NutzerPfarreiRolle(
                    nutzer_id=nutzer.id,
                    pfarrei_id=pfarrei_obj.id,
                    rolle=PfarreiRolle(role),
                )
            )

        db.commit()
        print(f"Nutzer '{email}' mit Rolle '{role}' angelegt.")
    finally:
        db.close()


def create_pfarrei(name: str) -> None:
    db = SessionLocal()
    try:
        if db.query(Pfarrei).filter(Pfarrei.name == name).first() is not None:
            print(f"Fehler: Pfarrei '{name}' existiert bereits.", file=sys.stderr)
            raise SystemExit(1)
        pfarrei = Pfarrei(name=name)
        db.add(pfarrei)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            print(f"Fehler: Pfarrei '{name}' existiert bereits.", file=sys.stderr)
            raise SystemExit(1) from None
        db.refresh(pfarrei)
        seed_default_stammdaten(db, pfarrei)
        print(f"Pfarrei '{name}' angelegt.")
    finally:
        db.close()


def seed_demo(pfarrei: str) -> None:
    db = SessionLocal()
    try:
        pfarrei_obj = db.query(Pfarrei).filter(Pfarrei.name == pfarrei).first()
        if pfarrei_obj is None:
            print(f"Fehler: Pfarrei '{pfarrei}' existiert nicht.", file=sys.stderr)
            raise SystemExit(1)
        seed_demo_daten(db, pfarrei_obj)
        print(f"Beispieldaten für Pfarrei '{pfarrei}' angelegt.")
    finally:
        db.close()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    subparsers = parser.add_subparsers(dest="command", required=True)

    create_user_parser = subparsers.add_parser("create-user", help="Legt einen neuen Nutzer an")
    create_user_parser.add_argument("--email", required=True)
    create_user_parser.add_argument("--password", required=True)
    create_user_parser.add_argument(
        "--role",
        required=True,
        choices=["admin", "pfarrei_verantwortlicher", "betrachter"],
    )
    create_user_parser.add_argument("--pfarrei", help="Name der Pfarrei (für nicht-admin Rollen)")

    create_pfarrei_parser = subparsers.add_parser(
        "create-pfarrei", help="Legt eine neue Pfarrei an"
    )
    create_pfarrei_parser.add_argument("--name", required=True)

    seed_demo_parser = subparsers.add_parser(
        "seed-demo", help="Legt Beispiel-Minis und einen Beispiel-Miniplan für eine Pfarrei an"
    )
    seed_demo_parser.add_argument("--pfarrei", required=True)

    return parser


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command == "create-user":
        create_user(args.email, args.password, args.role, args.pfarrei)
    elif args.command == "create-pfarrei":
        create_pfarrei(args.name)
    elif args.command == "seed-demo":
        seed_demo(args.pfarrei)


if __name__ == "__main__":
    main()
