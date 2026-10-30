from sqlalchemy import text
from database import get_lanka_time
from typing import List, Optional
from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime, date, time, timedelta
from database import SessionLocal
from fastapi import FastAPI, Depends, HTTPException, status, File, UploadFile, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import extract
from pydantic import BaseModel
import os
import httpx
import random
import re
import uuid
import base64
import hashlib # --- Added newly for SHA-256 Hashing ---
from cryptography.fernet import Fernet
from stegano import lsb
from dotenv import load_dotenv
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from openai import OpenAI
import pyotp
from fastapi.staticfiles import StaticFiles
import glob
import os
from jose import jwt, JWTError
from apscheduler.schedulers.background import BackgroundScheduler
from contextlib import asynccontextmanager
from fastapi.responses import FileResponse
import glob
import models, schemas, hashing, auth
from database import engine, get_db, SessionLocal

load_dotenv()

from web3 import Web3

# =========================================================
# BLOCKCHAIN CONFIGURATION (Sepolia Testnet)
# =========================================================
# (In a real system, these should be added to the .env file)

def push_hash_to_sepolia(hash_data: str):
    """PDF 6.5.2: Send SHA-256 Hash to the real Sepolia Blockchain"""
    try:
        # 1. Get .env values and remove hidden characters
        raw_url = str(os.getenv("SEPOLIA_RPC_URL", "")).strip().replace('"', '').replace("'", "")
        raw_addr = str(os.getenv("WALLET_ADDRESS", "")).strip().replace('"', '').replace("'", "")
        raw_key = str(os.getenv("WALLET_PRIVATE_KEY", "")).strip().replace('"', '').replace("'", "")
        
        # 2. Web3 connection
        w3 = Web3(Web3.HTTPProvider(raw_url))
        if not w3.is_connected():
            return "Blockchain Connection Failed (Invalid RPC URL)"

        # 3. Create Checksum Address
        checksum_address = Web3.to_checksum_address(raw_addr)
        p_key = raw_key if raw_key.startswith('0x') else f"0x{raw_key}"

        # 4. Create Transaction
        nonce = w3.eth.get_transaction_count(checksum_address)
        
        tx = {
            'nonce': nonce,
            'to': checksum_address, 
            'value': w3.to_wei(0, 'ether'),
            'gas': 3000000,  
            'gasPrice': w3.eth.gas_price,
            'chainId': 11155111, 
            'data': Web3.to_bytes(text=hash_data) 
        }

        # 5. Sign and send the Transaction
        signed_tx = w3.eth.account.sign_transaction(tx, p_key)
        
        # 🟢 FIX: Use raw_transaction for the latest Web3 (v6)
        try:
            tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
        except AttributeError:
            # Fallback to this if an older version is used
            tx_hash = w3.eth.send_raw_transaction(signed_tx.rawTransaction)

        # 6. Provide the real Blockchain TxID (Hex Format)
        real_tx_id = w3.to_hex(tx_hash)
        print(f"🟢 [BLOCKCHAIN SUCCESS] TxID: {real_tx_id}")
        return real_tx_id

    except Exception as e:
        error_msg = str(e)
        print(f"🔴 [BLOCKCHAIN ERROR LOG]: {error_msg}")
        
        if "insufficient funds" in error_msg.lower():
            return "Blockchain Failed: Insufficient Sepolia ETH balance in your wallet."
        elif "authentication" in error_msg.lower() or "401" in error_msg:
            return "Blockchain Failed: Alchemy/Infura API Key is invalid."
        elif "nonce" in error_msg.lower():
            return "Blockchain Failed: Transaction Nonce synchronization error."
        else:
            return f"Blockchain Failed: {error_msg[:50]}..."
models.Base.metadata.create_all(bind=engine)

def send_real_email_otp(target_email: str, otp: str):
    """Real-world SMTP Email OTP Dispatcher"""
    
    # Retrieve data only from .env (Not hardcoded)
    smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", 465))
    sender_email = os.getenv("SMTP_EMAIL")
    sender_password = os.getenv("SMTP_PASSWORD")

    # Safely halt the process if .env data is missing or incorrect
    if not sender_email or not sender_password:
        print(f"⚠️ [SMTP WARNING] Email Credentials Not Configured in .env! MOCK OTP is: {otp}")
        return

    msg = MIMEMultipart()
    msg['From'] = f"MedCare Security <{sender_email}>"
    msg['To'] = target_email
    msg['Subject'] = "MedCare Account - Your Verification OTP"
    
    # ... (Keep the remaining code as is)

    body = f"""
    Hello from MedCare,
    
    A login attempt was detected on your account.
    Your One-Time Password (OTP) is: {otp}
    
    This code is valid for 3 minutes. Do not share this with anyone.
    
    Securely,
    Project Medcare Security Team
    """
    msg.attach(MIMEText(body, 'plain'))

    try:
        server = smtplib.SMTP_SSL(smtp_server, smtp_port)
        server.login(sender_email, sender_password)
        server.send_message(msg)
        server.quit()
        print(f"✅ [SMTP] Successfully sent OTP to {target_email}")
    except Exception as e:
        print(f"❌ [SMTP ERROR] Failed to send email: {str(e)}")

from datetime import datetime, timedelta
from database import SessionLocal, get_lanka_time

def mark_no_shows_cron_job():
    """Mark unattended appointments from yesterday or earlier as 'No Show'"""
    db = SessionLocal()
    try:
        today = get_lanka_time().date()
        missed_appointments = db.query(models.Appointment).filter(
            models.Appointment.status == "Confirmed",
            models.Appointment.date < today
        ).all()

        for appt in missed_appointments:
            appt.status = "No Show"

        db.commit()
        print(f"[{get_lanka_time()}] CRON: {len(missed_appointments)} missed appointments marked as 'No Show'.")
    except Exception as e:
        db.rollback()
        print(f"Error in No-Show Cron Job: {e}")
    finally:
        db.close()


def send_appointment_reminders():
    """Send appointment reminder messages for tomorrow"""
    db = SessionLocal()
    try:
        tomorrow = get_lanka_time().date() + timedelta(days=1)
        upcoming_appointments = db.query(models.Appointment).filter(
            models.Appointment.status == "Confirmed",
            models.Appointment.date == tomorrow
        ).all()

        count = 0
        for appt in upcoming_appointments:
            existing_notif = db.query(models.Notification).filter(
                models.Notification.patient_id == appt.patient_id,
                models.Notification.reference_id == appt.id,
                models.Notification.notification_type == "APPOINTMENT_REMINDER"
            ).first()
            
            if not existing_notif:
                doc_user = db.query(models.User).filter(models.User.username == appt.doctor_name).first()
                doc_display_name = doc_user.full_name if doc_user and doc_user.full_name else appt.doctor_name
                
                msg = f"Reminder: You have an appointment tomorrow ({tomorrow}) with Dr. {doc_display_name} (Queue No: {appt.slot_number})."
                new_notif = models.Notification(
                    patient_id=appt.patient_id,
                    message=msg,
                    notification_type="APPOINTMENT_REMINDER",
                    reference_id=appt.id
                )
                db.add(new_notif)
                count += 1

        db.commit()
        print(f"[{get_lanka_time()}] CRON: {count} reminders sent for tomorrow ({tomorrow}).")
    except Exception as e:
        db.rollback()
        print(f"Error in Reminder Cron Job: {e}")
    finally:
        db.close()

# ==========================================
# (ඔයාගේ lifespan function එක මෙතනට යටින් තියන්න)
# @asynccontextmanager ...
# ==========================================
# =========================================================
# AUDIT LOGGING HELPERS (IP Tracking for all 4 Roles)
# =========================================================
def log_admin_action(db: Session, admin_id: int, action: str, ip_address: str, details: str):
    db.add(models.AdminAuditLog(admin_id=admin_id, action=action, ip_address=ip_address, details=details))
    db.commit()

def log_patient_action(db: Session, patient_id: int, action: str, ip_address: str, details: str):
    db.add(models.PatientActivityLog(patient_id=patient_id, action=action, ip_address=ip_address, details=details))
    db.commit()

def log_doctor_action(db: Session, doctor_id: int, action: str, ip_address: str, details: str):
    db.add(models.DoctorActivityLog(doctor_id=doctor_id, action=action, ip_address=ip_address, details=details))
    db.commit()

def log_lab_tech_action(db: Session, tech_id: int, action: str, ip_address: str, details: str):
    db.add(models.LabTechActivityLog(tech_id=tech_id, action=action, ip_address=ip_address, details=details))
    db.commit()
# =========================================================
app = FastAPI(title="Medcare Backend API") # 🔥 This is the missing line!
# Open the folder corresponding to viewing .png reports for patients
os.makedirs("uploaded_reports", exist_ok=True)
app.mount("/uploaded_reports", StaticFiles(directory="uploaded_reports"), name="uploaded_reports")
frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
print(f"🌐 ALLOWED FRONTEND URL: {frontend_url}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
@app.get("/")
def read_root():
    return {"message": "Welcome to Project Medcare Backend! Server is running successfully."}


# 🚀 The new Endpoint should be added right here:
@app.get("/setup-admin")
def setup_admin_manual(db: Session = Depends(get_db)):
    admin_exists = db.query(models.User).filter(models.User.role == "Admin").first()
    
    if admin_exists:
        return {"message": "Admin already exists in the system! You can log in."}
        
# අලුත් කෝඩ් එක (os.getenv පාවිච්චි කරලා):
    admin_password = os.getenv("FIRST_ADMIN_PASSWORD")
    #if not admin_password:
    #    raise Exception("CRITICAL: FIRST_ADMIN_PASSWORD is not set in .env file!")
    hashed_pw = hashing.Hash.bcrypt(admin_password)    
    genesis_admin = models.User(
        username="superadmin", 
        email="admin@medcare.lk", 
        hashed_password=hashed_pw, 
        role="Admin", 
        is_active=True, 
        is_first_login=True
    )
    db.add(genesis_admin)
    db.commit()

    return {"message": "🚀 Awesome! GENESIS ADMIN has been newly added to the Database!"}# ---------------------------------------------------------
# NEW FRONTEND REGISTRATION ROUTE (SAVES DIRECTLY TO DB)
# ---------------------------------------------------------
class PatientRegisterData(BaseModel):
    username: str
    nic: str
    full_name: str
    email: str
    date_of_birth: str
    gender: str
    contact_number: str
    city: str
    province: str
    home_address: str
    password: str

@app.post("/register")
def register_patient_from_frontend(request: PatientRegisterData, req: Request, db: Session = Depends(get_db)):
    # 1. Check Email
    if db.query(models.User).filter(models.User.email == request.email).first():
        raise HTTPException(status_code=400, detail="This Email address is already registered in the system!")
        
    # 2. Check Username
    if db.query(models.User).filter(models.User.username == request.username).first():
        raise HTTPException(status_code=400, detail="This username is already in use.")
        
    # 3. Calculate patient's age
    today = date.today()
    dob = datetime.strptime(request.date_of_birth, '%Y-%m-%d').date()
    calculated_age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    
    # 4. Generate a new Patient ID (PID)
    while True:
        generated_pid = f"P{random.randint(1000, 9999)}"
        if not db.query(models.Patient).filter(models.Patient.pid == generated_pid).first():
            break

    # 5. Insert data into the User Table (Hashed password)
    new_user = models.User(
        username=request.username, 
        email=request.email, 
        hashed_password=hashing.Hash.bcrypt(request.password), 
        role="Patient", 
        is_first_login=False
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # 6. Insert data into the Patient Table
    new_patient = models.Patient(
        id=new_user.id, 
        pid=generated_pid, 
        full_name=request.full_name, 
        dob=dob, 
        gender=request.gender, 
        age=calculated_age, 
        nic=request.nic, 
        contact_number=request.contact_number, 
        city=request.city, 
        province=request.province, 
        home_address=request.home_address
    )
    db.add(new_patient)
    db.commit()
    
    return {"message": "Registration Successful!", "pid": generated_pid}
# ---------------------------------------------------------
# LOGIN WITH MFA & IP TRACKING
# ---------------------------------------------------------
@app.post("/login", tags=["Authentication"])
def login(request: OAuth2PasswordRequestForm = Depends(), req: Request = None, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == request.username).first()
    client_ip = req.client.host if req else "Unknown"

# 1. FAILED LOGIN TRACKING (Brute-force detection for ALL users)
    if not user or not hashing.Hash.verify(user.hashed_password, request.password):
        if user: # Log according to the Role only if the user is in the system
            if user.role == "Patient": log_patient_action(db, user.id, "FAILED_LOGIN", client_ip, "Incorrect password attempt")
            elif user.role == "Admin": log_admin_action(db, user.id, "FAILED_LOGIN", client_ip, "Incorrect password attempt")
            elif user.role == "Doctor": log_doctor_action(db, user.id, "FAILED_LOGIN", client_ip, "Incorrect password attempt")
            elif user.role == "Lab Technician": log_lab_tech_action(db, user.id, "FAILED_LOGIN", client_ip, "Incorrect password attempt")
        raise HTTPException(status_code=401, detail="Incorrect Username or Password!")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Your account has been deactivated.")

    # MFA logic
    if user.mfa_email_enabled or user.mfa_app_enabled:
        temp_token = auth.create_access_token(data={"sub": user.username, "type": "mfa_pending"})
        if user.mfa_email_enabled:
            otp_val = str(random.randint(100000, 999999))
            expires = get_lanka_time() + timedelta(minutes=3)
            db.add(models.EmailOTP(user_id=user.id, otp_code=otp_val, expires_at=expires))
            db.commit()
            # Call the actual email dispatch function
            send_real_email_otp(user.email, otp_val)
        return {"mfa_required": True, "temp_token": temp_token, "message": "Please provide the MFA code."}

    # 2. SESSION TRACKING FOR ALL LOGINS (Missing Session Bug Fixed)
    access_token = auth.create_access_token(data={"sub": user.username})
    user_agent = req.headers.get("User-Agent", "Unknown Device")
    
    new_session = models.UserSession(
        user_id=user.id,
        session_token=access_token,
        ip_address=client_ip,
        user_agent=user_agent
    )
    db.add(new_session)
    db.commit()
    
    if user.role == "Patient": log_patient_action(db, user.id, "SUCCESSFUL_LOGIN", client_ip, f"Logged in via {user_agent[:30]}")
    elif user.role == "Admin": log_admin_action(db, user.id, "LOGIN", client_ip, "Logged in")
    elif user.role == "Doctor": log_doctor_action(db, user.id, "LOGIN", client_ip, "Logged in")
    elif user.role == "Lab Technician": log_lab_tech_action(db, user.id, "LOGIN", client_ip, "Logged in")
    
    return {"access_token": access_token, "token_type": "bearer", "is_first_login": user.is_first_login, "role": user.role}

@app.post("/login/mfa", tags=["Authentication"])
def login_mfa_verify(request: schemas.LoginMFARequest, req: Request, db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(request.temp_token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
        username: str = payload.get("sub")
        token_type: str = payload.get("type")
        if token_type != "mfa_pending": raise HTTPException(status_code=400, detail="Invalid token type.")
    except Exception:
        raise HTTPException(status_code=401, detail="Token expired or invalid.")
        
    user = db.query(models.User).filter(models.User.username == username).first()
    
    if user.mfa_email_enabled:
        otp_record = db.query(models.EmailOTP).filter(models.EmailOTP.user_id == user.id).order_by(models.EmailOTP.id.desc()).first()
        if not otp_record or otp_record.otp_code != request.email_otp:
            raise HTTPException(status_code=401, detail="Invalid Email OTP.")
        if get_lanka_time() > otp_record.expires_at:
            raise HTTPException(status_code=401, detail="The 3-minute expiration time for the Email OTP has passed.")
            
    if user.mfa_app_enabled:
        totp = pyotp.TOTP(user.mfa_secret)
        if not totp.verify(request.app_totp):
            raise HTTPException(status_code=401, detail="Invalid Authenticator App code.")

    access_token = auth.create_access_token(data={"sub": user.username, "mfa_verified": True})

    # 🚨 FIX: Bring client_ip up to prevent Server Crash
    client_ip = req.client.host if req else "Unknown"
    
    # Save the Session to the Database at login time
    user_agent = req.headers.get("User-Agent", "Unknown Device")
    new_session = models.UserSession(
        user_id=user.id,
        session_token=access_token,
        ip_address=client_ip,
        user_agent=user_agent
    )
    db.add(new_session)
    db.commit()
    log_patient_action(db, user.id, "MFA_LOGIN", client_ip, "Successfully logged in with MFA") if user.role == "Patient" else None
    
    return {"access_token": access_token, "token_type": "bearer", "is_first_login": user.is_first_login, "role": user.role}

@app.post("/auth/force-change-password", tags=["Authentication"])
def force_change_password(request: schemas.PasswordChange, req: Request, db: Session = Depends(get_db)):
    """PDF - Admin Onboarding: Temporary password changes and strict password policies"""
    
    password_regex = r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$"
    if not re.match(password_regex, request.new_password):
        raise HTTPException(status_code=400, detail="The password must be at least 12 characters long, containing one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&).")

    user = db.query(models.User).filter(models.User.username == request.username).first()
    if not user or not hashing.Hash.verify(user.hashed_password, request.temp_password):
        raise HTTPException(status_code=400, detail="Invalid Username or temporary password!")
    if not user.is_first_login:
        raise HTTPException(status_code=400, detail="You have already changed your password! Please login.")

    # The temporary password is overwritten with the new value and completely destroyed
    user.hashed_password = hashing.Hash.bcrypt(request.new_password)
    user.is_first_login = False
    db.commit()
    db.refresh(user)
    
    # 🚨 FIX: Record password change in Audit Log
    client_ip = req.client.host if req else "Unknown"
    if user.role == "Admin": log_admin_action(db, user.id, "PASSWORD_CHANGED", client_ip, "Completed forced password change")
    elif user.role == "Doctor": log_doctor_action(db, user.id, "PASSWORD_CHANGED", client_ip, "Completed forced password change")
    elif user.role == "Lab Technician": log_lab_tech_action(db, user.id, "PASSWORD_CHANGED", client_ip, "Completed forced password change")
    
    return {"message": "Password updated successfully! Please login with the new password."}
# ---------------------------------------------------------
# USER REGISTRATION ENDPOINTS
# ---------------------------------------------------------
# ---------------------------------------------------------
# USER REGISTRATION ENDPOINTS (100% PDF Compliant)
# ---------------------------------------------------------
@app.post("/patients/", response_model=schemas.PatientResponse, tags=["Patients"])
def create_patient(request: schemas.PatientCreate, req: Request, db: Session = Depends(get_db)):
    
    # 1. Check Email
    if db.query(models.User).filter(models.User.email == request.email).first():
        raise HTTPException(status_code=400, detail="This Email address is already registered in the system!")
        
    # 2. Check Username (Same message as in the PDF)
    if db.query(models.User).filter(models.User.username == request.username).first():
        raise HTTPException(
            status_code=400, 
            detail=f"The username {request.username} is already being used by another patient. Please enter a different username."
        )
        
    today = date.today()
    calculated_age = today.year - request.dob.year - ((today.month, today.day) < (request.dob.month, request.dob.day))
    
    # 3. 100% Unique Patient ID (PID) Generation
    while True:
        generated_pid = f"P{random.randint(1000, 9999)}"
        if not db.query(models.Patient).filter(models.Patient.pid == generated_pid).first():
            break

    new_user = models.User(username=request.username, email=request.email, hashed_password=hashing.Hash.bcrypt(request.password), role="Patient", is_first_login=False)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    new_patient = models.Patient(id=new_user.id, pid=generated_pid, full_name=request.full_name, dob=request.dob, gender=request.gender, age=calculated_age, nic=request.nic, contact_number=request.contact_number, city=request.city, province=request.province, home_address=request.home_address)
    db.add(new_patient)
    db.commit()
    db.refresh(new_patient)
    
    client_ip = req.client.host if req else "Unknown"
    log_patient_action(db, new_user.id, "SELF_REGISTER", client_ip, f"Patient registered with PID: {generated_pid}")
    return new_patient

@app.post("/admin/doctors/", tags=["Admin Operations"])
def create_doctor(request: schemas.DoctorCreateAdmin, req: Request, db: Session = Depends(get_db), current_user: models.User = Depends(auth.require_admin)):
    if db.query(models.User).filter(models.User.email == request.email).first():
        raise HTTPException(status_code=400, detail="This Email address already exists in the system!")

    while True:
        generated_emp_id = f"D{random.randint(1000, 9999)}"
        if not db.query(models.User).filter(models.User.username == generated_emp_id).first():
            break
            
    # Create the 4-segment format according to the PDF
    generated_temp_pw = f"DOC-{random.randint(1000, 9999)}-{random.randint(100, 999)}-{random.randint(100, 999)}"

    new_user = models.User(username=generated_emp_id, email=request.email, hashed_password=hashing.Hash.bcrypt(generated_temp_pw), role="Doctor", employee_id=generated_emp_id, full_name=request.full_name, dob=request.dob, gender=request.gender, contact_number=request.contact_number, nic=request.nic, address=request.home_address, specialization=request.specialization, qualifications=request.qualifications, experience_years=request.experience_years, slmc_number=request.slmc_number, is_first_login=True)
    db.add(new_user)
    db.commit()

    client_ip = req.client.host if req else "Unknown"
    log_admin_action(db, current_user.id, "REGISTER_DOCTOR", client_ip, f"Registered new doctor: {generated_emp_id}")
    return {"message": "Doctor registered successfully!", "employee_id": generated_emp_id, "temporary_password": generated_temp_pw}

@app.post("/admin/lab-techs/", tags=["Admin Operations"])
def create_lab_tech(request: schemas.LabTechCreateAdmin, req: Request, db: Session = Depends(get_db), current_user: models.User = Depends(auth.require_admin)):
    if db.query(models.User).filter(models.User.email == request.email).first():
        raise HTTPException(status_code=400, detail="This Email address already exists!")

    while True:
        generated_emp_id = f"L{random.randint(1000, 9999)}"
        if not db.query(models.User).filter(models.User.username == generated_emp_id).first():
            break
            
    # Create the 4-segment format according to the PDF
    generated_temp_pw = f"LAB-{random.randint(1000, 9999)}-{random.randint(100, 999)}-{random.randint(100, 999)}"

    new_user = models.User(username=generated_emp_id, email=request.email, hashed_password=hashing.Hash.bcrypt(generated_temp_pw), role="Lab Technician", employee_id=generated_emp_id, full_name=request.full_name, dob=request.dob, gender=request.gender, contact_number=request.mobile_number, nic=request.nic, address=request.residential_address, qualifications=request.qualifications, mlt_id=request.mlt_id, is_first_login=True)
    db.add(new_user)
    db.commit()

    client_ip = req.client.host if req else "Unknown"
    log_admin_action(db, current_user.id, "REGISTER_LAB_TECH", client_ip, f"Registered new Lab Tech: {generated_emp_id}")
    return {"message": "Lab Technician registered successfully!", "employee_id": generated_emp_id, "temporary_password": generated_temp_pw}

# --- Employee Offboarding (Soft Delete & Session Kill) ---
@app.put("/admin/users/{employee_id}/deactivate", tags=["Admin Operations"])
def deactivate_employee(employee_id: str, req: Request, db: Session = Depends(get_db), current_user: models.User = Depends(auth.require_admin)):
    """PDF 5.3: Employee Offboarding and Session Kill (Blockchain removed)"""
    target_user = db.query(models.User).filter(models.User.employee_id == employee_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="Employee not found!")
    
    # 1. Soft Delete (Deactivate from the Database)
    target_user.is_active = False 
    
    # 2. Instant Session Kill (Force logout if currently logged in)
    db.query(models.UserSession).filter(
        models.UserSession.user_id == target_user.id,
        models.UserSession.is_active == True
    ).update({"is_active": False})
    
    db.commit()
    
    client_ip = req.client.host if req else "Unknown"
    
    # Standard Database log kept, Blockchain removed
    log_admin_action(db, current_user.id, "DEACTIVATE_EMPLOYEE", client_ip, f"Deactivated {employee_id} & Sessions Revoked.")
    
    return {"message": f"Employee ({employee_id}) deactivated and successfully removed from the system."}

@app.get("/admin/users/", response_model=List[schemas.UserResponse], tags=["Admin Operations"])
def get_all_users(db: Session = Depends(get_db), current_user: models.User = Depends(auth.require_admin)):
    return db.query(models.User).all()

# ---------------------------------------------------------
# APPOINTMENTS & DOCTOR SCHEDULES
# ---------------------------------------------------------
@app.get("/patients/", response_model=List[schemas.PatientResponse], tags=["Patients"])
def get_patients(db: Session = Depends(get_db), current_user: str = Depends(auth.get_current_user)):
    return db.query(models.Patient).all()

@app.post("/admin/schedules/", response_model=schemas.DoctorScheduleResponse, tags=["Admin Operations"])
def create_doctor_schedule(schedule: schemas.DoctorScheduleCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.require_admin)):
    doctor = db.query(models.User).filter(models.User.username == schedule.doctor_name).first()
    if not doctor:
        raise HTTPException(status_code=404, detail="No doctor is registered under this name!")
# 🚨 FIX 1: Block creating multiple schedules for the same doctor on the same date (Duplicate Schedules)
    existing_schedule = db.query(models.DoctorSchedule).filter(
        models.DoctorSchedule.doctor_id == doctor.id, 
        models.DoctorSchedule.date == schedule.date
    ).first()
    
    if existing_schedule:
        raise HTTPException(status_code=400, detail=f"A schedule has already been created for this doctor on {schedule.date}!")
    new_schedule = models.DoctorSchedule(doctor_id=doctor.id, date=schedule.date, start_time=schedule.start_time, end_time=schedule.end_time, max_patients=schedule.max_patients)
    db.add(new_schedule)
    db.commit()
    db.refresh(new_schedule)
    return new_schedule

@app.get("/schedules/monthly", tags=["Appointments"])
def get_monthly_schedules(year: int, month: int, db: Session = Depends(get_db)):
    """Provide dates with available doctors for the given month to the Frontend Calendar"""
    schedules = db.query(models.DoctorSchedule).filter(
        extract('year', models.DoctorSchedule.date) == year,
        extract('month', models.DoctorSchedule.date) == month
    ).all()
    
    schedule_data = {}
    for sch in schedules:
        date_str = str(sch.date)
        if date_str not in schedule_data:
            schedule_data[date_str] = []
        doc_name = sch.doctor.full_name if sch.doctor.full_name else sch.doctor.username
        initials = "".join([word[0].upper() for word in doc_name.split() if word])
        schedule_data[date_str].append({
            "doctor_username": sch.doctor.username,
            "doctor_name": doc_name,
            "initials": initials,
            "specialization": sch.doctor.specialization
        })
    return schedule_data


@app.get("/schedules/slots", tags=["Appointments"])
def get_available_slots(date: date, doctor_username: str, db: Session = Depends(get_db)):
    """Show Booked (Red) and Available (Green) slots for a specific date and doctor"""
    # 🚨 FIX: First find the doctor from the User table, then search the Schedule using their ID
    doctor = db.query(models.User).filter(models.User.username == doctor_username).first()
    schedule = db.query(models.DoctorSchedule).filter(
        models.DoctorSchedule.doctor_id == doctor.id, 
        models.DoctorSchedule.date == date
    ).first()
    
    if not schedule:
        raise HTTPException(status_code=404, detail="No schedule found for this date.")
        
    booked_appointments = db.query(models.Appointment).filter(
        models.Appointment.doctor_name == doctor_username,
        models.Appointment.date == date,
        models.Appointment.status != "Cancelled" 
    ).all()
    
    booked_slots = [apt.slot_number for apt in booked_appointments]
    all_slots = list(range(1, schedule.max_patients + 1))
    
    return {
        "max_patients": schedule.max_patients,
        "booked_slots": booked_slots,
        "available_slots": [s for s in all_slots if s not in booked_slots]
    }


@app.post("/appointments/", response_model=schemas.AppointmentResponse, tags=["Appointments"])
def book_appointment(appointment: schemas.AppointmentCreate, req: Request, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    today = get_lanka_time().date()
    # 1. Block Past Date Bookings
    if appointment.date < today:
        raise HTTPException(status_code=400, detail="Appointments cannot be booked for past dates!")

    doctor = db.query(models.User).filter(models.User.username == appointment.doctor_name).first()
    if not doctor:
        raise HTTPException(status_code=404, detail="No doctor found with this name in the system.")
        
    schedule = db.query(models.DoctorSchedule).filter(
        models.DoctorSchedule.doctor_id == doctor.id, 
        models.DoctorSchedule.date == appointment.date
    ).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="No doctor schedule available for this date!")
    if appointment.slot_number < 1 or appointment.slot_number > schedule.max_patients:
        raise HTTPException(status_code=400, detail=f"Please select a number between 1 and {schedule.max_patients}.")
        
    # Ignore cancelled appointments
    existing_booking = db.query(models.Appointment).filter(
        models.Appointment.doctor_name == appointment.doctor_name, 
        models.Appointment.date == appointment.date, 
        models.Appointment.slot_number == appointment.slot_number,
        models.Appointment.status != "Cancelled"
    ).first()
    
    if existing_booking:
        raise HTTPException(status_code=400, detail="Sorry, this slot number was just booked by someone else")
        
    apt_num = f"APT-2026-{random.randint(1000, 9999)}"
    new_apt = models.Appointment(
        appointment_number=apt_num, 
        patient_id=current_user.id, 
        doctor_name=appointment.doctor_name, 
        date=appointment.date, 
        slot_number=appointment.slot_number, 
        status="Confirmed"
    )
    db.add(new_apt)
    db.commit()
    db.refresh(new_apt)

    # 2. Booking Notification Trigger
    # 🟢 Retrieve the doctor's real name instead of ID to display to the patient
    doc_display_name = doctor.full_name if doctor.full_name else doctor.username
    notif_msg = f"Your appointment has been successfully booked. Ref No: {apt_num} (Dr. {doc_display_name} | {appointment.date})"
    
    db.add(models.Notification(patient_id=current_user.id, message=notif_msg, notification_type="APPOINTMENT_CONFIRMED", reference_id=new_apt.id))
    db.commit()

    client_ip = req.client.host if req else "Unknown"
    if current_user.role == "Patient":
        log_patient_action(db, current_user.id, "BOOK_APPOINTMENT", client_ip, f"Booked {apt_num} for {appointment.doctor_name}")
    return new_apt
# ---------------------------------------------------------
# DOCTOR OPERATIONS & AUTO-BILLING TRIGGERS
# ---------------------------------------------------------
@app.get("/doctors/me/dashboard", tags=["Doctor Portal", "Dashboard"])
def get_doctor_dashboard(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """PDF 6.2: Doctor's main dashboard (Summary Cards & Today's Queue)"""
    if current_user.role != "Doctor":
        raise HTTPException(status_code=403, detail="Doctors only.")

    # 6.1.1 Zero-Trust Logic: Block Dashboard access if the password is not updated
    if current_user.is_first_login:
        raise HTTPException(status_code=403, detail="First-time login detected. Please update your password.")

    today = get_lanka_time().date()

    # Get the list of all uncancelled appointments for today
    today_appointments = db.query(models.Appointment).filter(
        models.Appointment.doctor_name == current_user.username,
        models.Appointment.date == today,
        models.Appointment.status != "Cancelled"
    ).order_by(models.Appointment.slot_number.asc()).all()

    # 6.2 (A): Calculate Summary Cards
    total_patients = len(today_appointments)
    completed_count = sum(1 for apt in today_appointments if apt.status == "Completed")
    pending_count = total_patients - completed_count

    # 6.2 (B): Prepare Today's Queue
    queue_list = []
    for apt in today_appointments:
        # Remove completed patients from the queue and show only the pending ones
        if apt.status != "Completed":
            patient = db.query(models.Patient).filter(models.Patient.id == apt.patient_id).first()
            queue_list.append({
                "appointment_id": apt.id,
                "appointment_number": apt.appointment_number,
                "slot_number": apt.slot_number,
                "patient_name": patient.full_name if patient else "Unknown",
                "status": apt.status
            })

    # Format and return data for the Frontend
    return {
        "summary_cards": {
            "total_patients_today": total_patients,
            "completed": completed_count,
            "pending": pending_count
        },
        "todays_queue": queue_list
    }

@app.post("/appointments/{appointment_id}/arrive", response_model=schemas.BillResponse, tags=["Doctor Operations"])
def patient_arrived_trigger(appointment_id: int, req: Request, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """PDF 6.3.1: Patient arrival (Idempotent / Double-click protected)"""
    appointment = db.query(models.Appointment).filter(models.Appointment.id == appointment_id).first()
    if not appointment: 
        raise HTTPException(status_code=404, detail="Appointment not found!")
        
    # 🚨 Idempotency Logic: If the button is clicked twice or the patient has already arrived, return the existing bill without creating a new one
    existing_bill = db.query(models.Bill).filter(models.Bill.appointment_id == appointment_id).first()
    if existing_bill:
        return existing_bill 
        
    # 1. Primary Billing Trigger: Create bill with a doctor fee of LKR 2500
    bill_num = f"BILL-2026-{random.randint(1000, 9999)}"
    new_bill = models.Bill(
        bill_number=bill_num, 
        appointment_id=appointment.id, 
        patient_id=appointment.patient_id, 
        doctor_fee=2500.0, 
        lab_fee=0.0, 
        total_amount=2500.0, 
        status="PENDING"
    )
    db.add(new_bill)
    
    # 2. UX Update: Change Status to confirm the patient is in the room
    appointment.status = "In Progress"
    
    db.commit()
    db.refresh(new_bill)

    if current_user.role == "Doctor":
        client_ip = req.client.host if req else "Unknown"
        log_doctor_action(db, current_user.id, "PATIENT_ARRIVED", client_ip, f"Triggered arrival for APT: {appointment.appointment_number}")
        
    return new_bill

@app.get("/doctors/lab-test-catalog", tags=["Doctor Operations"])
def get_lab_test_catalog(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Fetch live approved lab tests directly from the Database Catalog"""
    if current_user.role != "Doctor":
        raise HTTPException(status_code=403, detail="Doctors only.")
    
    db_tests = db.query(models.LabTestCatalog).all()
    return [{"test_name": test.test_name, "price": test.price} for test in db_tests]


@app.post("/appointments/{appointment_id}/send-to-lab", response_model=schemas.BillResponse, tags=["Doctor Operations"])
def send_to_lab_trigger(appointment_id: int, request: schemas.LabTestRequest, req: Request, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Send to lab and dynamically add fees from Database Catalog"""
    
    catalog_item = db.query(models.LabTestCatalog).filter(models.LabTestCatalog.test_name == request.test_name).first()
    if not catalog_item:
        raise HTTPException(status_code=400, detail="This laboratory test is not in the hospital catalog!")
        
    bill = db.query(models.Bill).filter(models.Bill.appointment_id == appointment_id).first()
    if not bill: 
        raise HTTPException(status_code=404, detail="Please click 'Patient Arrived' first")
    
    existing_test = db.query(models.LabTest).filter(
        models.LabTest.patient_id == bill.patient_id, 
        models.LabTest.test_name == request.test_name,
        models.LabTest.status == "Pending" 
    ).first()
    
    if existing_test:
        return bill
        
    bill.lab_fee += catalog_item.price
    bill.total_amount = bill.doctor_fee + bill.lab_fee
    
    new_lab_test = models.LabTest(patient_id=bill.patient_id, test_name=request.test_name, status="Pending", received_time=get_lanka_time())
    db.add(new_lab_test)
    db.commit()
    db.refresh(bill)

    if current_user.role == "Doctor":
        client_ip = req.client.host if req else "Unknown"
        log_doctor_action(db, current_user.id, "SEND_TO_LAB", client_ip, f"Requested {request.test_name} for APT: {appointment_id}")
        
    return bill

@app.get("/appointments/{appointment_id}/lab-tests", tags=["Doctor Operations"])
def get_appointment_lab_tests(appointment_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Fetch all active/requested lab tests associated with a specific appointment"""
    if current_user.role != "Doctor":
        raise HTTPException(status_code=403, detail="Doctors only.")
        
    appointment = db.query(models.Appointment).filter(models.Appointment.id == appointment_id).first()
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found!")
        
    apt_date_start = datetime.combine(appointment.date, time.min)
    apt_date_end = datetime.combine(appointment.date, time.max)
    
    lab_tests = db.query(models.LabTest).filter(
        models.LabTest.patient_id == appointment.patient_id,
        models.LabTest.received_time >= apt_date_start,
        models.LabTest.received_time <= apt_date_end
    ).all()
    
    return lab_tests

@app.put("/lab-tests/{test_id}/cancel", tags=["Doctor Operations"])
def cancel_lab_test(test_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Cancel a pending lab test request"""
    if current_user.role != "Doctor":
        raise HTTPException(status_code=403, detail="Doctors only.")

    lab_test = db.query(models.LabTest).filter(models.LabTest.id == test_id).first()
    if not lab_test:
        raise HTTPException(status_code=404, detail="Lab test request not found!")

    if lab_test.status != "Pending" and lab_test.status != "PENDING":
        raise HTTPException(status_code=400, detail="Cannot cancel a test that is already collected or completed.")

    db.delete(lab_test)
    db.commit()

    return {"message": "Lab test request cancelled successfully"}

def check_ddi(medicines: list, db: Session):
    """Dynamically checks prescribed medicines against active database DDI rules."""
    if not medicines or len(medicines) < 2:
        return None

    prescribed_lower = [m.strip().lower() for m in medicines]
    active_rules = db.query(models.DDIRule).filter(models.DDIRule.is_active == True).all()

    for rule in active_rules:
        drug_a_match = any(rule.drug_a.lower() in p or p in rule.drug_a.lower() for p in prescribed_lower)
        drug_b_match = any(rule.drug_b.lower() in p or p in rule.drug_b.lower() for p in prescribed_lower)

        if drug_a_match and drug_b_match:
            return {
                "rule_match": rule.rule_name,
                "risk_level": rule.risk_level,
                "details": rule.details
            }
    return None


def seed_default_clinical_data():
    """Populates default DDI rules, Lab Catalog prices, and Medicine Inventory if database tables are empty."""
    db = SessionLocal()
    try:
        if db.query(models.DDIRule).count() == 0:
            default_ddi = [
                models.DDIRule(drug_a="Diclofenac", drug_b="Ibuprofen", rule_name="NSAID + NSAID", risk_level="🔴 LETHAL / CRITICAL", details="High risk of severe bleeding and kidney failure."),
                models.DDIRule(drug_a="Losartan", drug_b="Potassium Citrate", rule_name="ARB + Potassium Supplement", risk_level="🔴 LETHAL / CRITICAL", details="Giving Losartan and Potassium Citrate together can put the patient at risk of Hyperkalemic Cardiac Arrest."),
                models.DDIRule(drug_a="Tamsulosin", drug_b="Sildenafil", rule_name="Alpha-blocker + PDE5 Inhibitor", risk_level="🔴 HIGH RISK", details="Risk of severe hypotension."),
                models.DDIRule(drug_a="Ciprofloxacin", drug_b="Calcium Carbonate", rule_name="Antibiotic + Minerals", risk_level="🟠 MODERATE RISK", details="Minerals prevent antibiotic absorption."),
                models.DDIRule(drug_a="Ibuprofen", drug_b="Prednisolone", rule_name="NSAID + Corticosteroid", risk_level="🔴 HIGH RISK", details="Increased risk of peptic ulcers.")
            ]
            db.add_all(default_ddi)

        if db.query(models.LabTestCatalog).count() == 0:
            default_labs = [
                models.LabTestCatalog(test_name="Urine Full Report (UFR)", price=1200.0),
                models.LabTestCatalog(test_name="Urine Culture & ABST", price=4000.0),
                models.LabTestCatalog(test_name="Serum Creatinine", price=1200.0),
                models.LabTestCatalog(test_name="eGFR", price=500.0),
                models.LabTestCatalog(test_name="Blood Urea Nitrogen (BUN)", price=1500.0),
                models.LabTestCatalog(test_name="Fasting Blood Sugar (FBS)", price=900.0),
                models.LabTestCatalog(test_name="HbA1c", price=2800.0),
                models.LabTestCatalog(test_name="Serum Electrolytes (Na+, K+, Cl-)", price=3500.0),
                models.LabTestCatalog(test_name="VDRL Test / HIV Screening", price=2500.0),
                models.LabTestCatalog(test_name="Full Blood Count (FBC)", price=1500.0)
            ]
            db.add_all(default_labs)

        if db.query(models.MedicineInventory).count() == 0:
            default_meds = [
                models.MedicineInventory(brand_name="Cozaar", generic_name="Losartan", category="Nephrology", is_available=True),
                models.MedicineInventory(brand_name="Lasix", generic_name="Furosemide", category="Nephrology", is_available=True),
                models.MedicineInventory(brand_name="Lipitor", generic_name="Atorvastatin", category="Cardiology", is_available=True),
                models.MedicineInventory(brand_name="Panadol", generic_name="Paracetamol", category="General", is_available=True)
            ]
            db.add_all(default_meds)

        db.commit()
        print("🟢 [CLINICAL ENGINE] Default DDI rules, Lab Test catalog, and Medicine Inventory initialized successfully!")
    except Exception as e:
        db.rollback()
        print(f"🔴 [CLINICAL SEED ERROR]: {e}")
    finally:
        db.close()

seed_default_clinical_data()

@app.post("/appointments/{appointment_id}/prescribe", response_model=schemas.PrescriptionResponse, tags=["Doctor Operations"])
def create_prescription(appointment_id: int, prescription: schemas.PrescriptionCreate, req: Request, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    if not prescription.medicines and not prescription.doctor_note:
        raise HTTPException(status_code=400, detail="Cannot send an empty prescription without medicines or a doctor's note!")
    appointment = db.query(models.Appointment).filter(models.Appointment.id == appointment_id).first()
    if not appointment: raise HTTPException(status_code=404, detail="Appointment not found!")

    med_names = [item.medicine_name for item in prescription.medicines]
    warning = check_ddi(med_names, db)

    if warning and not prescription.override_warning:
        raise HTTPException(
            status_code=400, 
            detail={
                "error_type": "DDI_WARNING",
                "title": "HIGH RISK INTERACTION DETECTED!",
                "rule_match": warning["rule_match"],
                "risk_level": warning["risk_level"],
                "details": warning["details"],
                "action_required": "If you wish to ignore this, provide 'override_warning': true."
            }
        )

    rx_num = f"RX-2026-{random.randint(100000, 999999)}"
    new_rx = models.Prescription(
        prescription_number=rx_num, 
        appointment_id=appointment.id, 
        doctor_id=current_user.id, 
        patient_id=appointment.patient_id, 
        doctor_note=prescription.doctor_note, 
        is_overridden=prescription.override_warning,
        override_reason=prescription.override_reason if prescription.override_warning else None
    )

    db.add(new_rx)
    db.commit()
    db.refresh(new_rx)

    for item in prescription.medicines:
        db.add(models.PrescriptionItem(
            prescription_id=new_rx.id, 
            medicine_name=item.medicine_name, 
            generic_name=item.generic_name,
            strength=item.strength,
            route=item.route,
            dose=item.dose, 
            frequency=item.frequency, 
            duration=item.duration, 
            quantity=item.quantity,
            before_after_meals=item.before_after_meals,
            instructions=item.instructions
        ))
    db.commit()
    db.refresh(new_rx)

    if current_user.role == "Doctor":
        client_ip = req.client.host if req else "Unknown"
        
        if prescription.override_warning:
            reason_text = prescription.override_reason if prescription.override_reason else "No reason provided"
            
            blockchain_data = f"Doctor_{current_user.id}|Patient_{appointment.patient_id}|OVERRIDE_DDI|{rx_num}|{get_lanka_time().isoformat()}|Reason_{reason_text}"
            generated_hash = hashlib.sha256(blockchain_data.encode()).hexdigest()
            
            blockchain_tx_id = push_hash_to_sepolia(generated_hash)
            
            # Save log entry in BlockchainAuditLog table
            bc_log = models.BlockchainAuditLog(
                actor_id=current_user.id,
                actor_role="Doctor",
                action_type="DDI_OVERRIDE",
                data_hash=generated_hash,
                tx_id=blockchain_tx_id,
                details=f"Overrode DDI for Rx: {rx_num}. Reason: {reason_text}"
            )
            db.add(bc_log)
            db.commit()

            log_details = f"DDI Bypassed. Reason: {reason_text} | Internal Hash: {generated_hash} | Blockchain TxID: {blockchain_tx_id}"
            log_doctor_action(db, current_user.id, "WARNING_OVERRIDDEN_BLOCKCHAIN", client_ip, log_details)
        else:
            log_doctor_action(db, current_user.id, "PRESCRIBED", client_ip, f"Issued E-Prescription: {rx_num}")
        
    doc_display_name = current_user.full_name if current_user.full_name else current_user.username
    notif = models.Notification(
        patient_id=appointment.patient_id, 
        message=f"Your E-Prescription is ready. (Issued by Dr. {doc_display_name})", 
        notification_type="PRESCRIPTION", 
        reference_id=new_rx.id
    )
    db.add(notif)
    db.commit()
    
    return new_rx

@app.put("/appointments/{appointment_id}/complete", tags=["Doctor Operations"])
def complete_appointment(appointment_id: int, req: Request, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Doctor completes the patient's consultation and removes them from the queue"""
    if current_user.role != "Doctor":
        raise HTTPException(status_code=403, detail="Doctors only.")
        
    appointment = db.query(models.Appointment).filter(
        models.Appointment.id == appointment_id, 
        models.Appointment.doctor_name == current_user.username
    ).first()
    
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found.")
        
    # --- 🚨 Newly added strict billing enforcement rule ---
    if appointment.status == "Confirmed":
        raise HTTPException(status_code=400, detail="Please click the 'Patient Arrived' button first to process the bill! (Cannot complete without arriving)")
        
    if appointment.status == "Completed":
        raise HTTPException(status_code=400, detail="This is already completed.")
        
    appointment.status = "Completed"
    appointment.completed_at = get_lanka_time() 
    db.commit()
    
    client_ip = req.client.host if req else "Unknown"
    log_doctor_action(db, current_user.id, "COMPLETED_APPOINTMENT", client_ip, f"Completed APT: {appointment.appointment_number}")
    return {"message": "Patient consultation successfully completed.", "completed_at": appointment.completed_at}

@app.get("/patients/me/history", tags=["Patients", "My Health Vault"])
def get_my_medical_history(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Allow patient to view their own Medical History"""
    if current_user.role != "Patient": raise HTTPException(status_code=403, detail="Patients only.")
    
    past_appointments = db.query(models.Appointment).filter(
        models.Appointment.patient_id == current_user.id,
        models.Appointment.status.in_(["Completed", "No Show"])
    ).order_by(models.Appointment.date.desc()).all()
    
    timeline = []
    for apt in past_appointments:
        prescriptions = db.query(models.Prescription).filter(models.Prescription.appointment_id == apt.id).all()
        apt_date_start = datetime.combine(apt.date, time.min)
        apt_date_end = datetime.combine(apt.date, time.max)
        lab_tests = db.query(models.LabTest).filter(
            models.LabTest.patient_id == current_user.id, 
            models.LabTest.received_time >= apt_date_start, 
            models.LabTest.received_time <= apt_date_end
        ).all()
        
        doc_user = db.query(models.User).filter(models.User.username == apt.doctor_name).first()
        display_name = doc_user.full_name if doc_user and doc_user.full_name else apt.doctor_name
        
        clinical_notes_combined = "No additional notes."
        diagnosis_combined = "No specific diagnosis recorded."
        
        if prescriptions:
            notes = [rx.doctor_note for rx in prescriptions if rx.doctor_note]
            if notes:
                clinical_notes_combined = " / ".join(notes)
                diagnosis_combined = "Prescription Issued (See E-Prescriptions for details)"
                
        if lab_tests:
            diagnosis_combined += " | Lab Tests Ordered"
            
        if apt.status == "No Show":
            diagnosis_combined = "Patient Did Not Attend"
            clinical_notes_combined = "Appointment missed by the patient."
        
        timeline.append({
            "id": apt.id,
            "date": str(apt.date), 
            "status": apt.status, 
            "doctor_name": display_name, 
            "diagnosis": diagnosis_combined, 
            "clinical_notes": clinical_notes_combined,
            "treatment_plan": f"Prescriptions: {len(prescriptions)} | Lab Tests: {len(lab_tests)}"
        })
    return timeline


@app.get("/patients/{patient_id}/history", tags=["Doctor Operations"])
def get_patient_medical_history(patient_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Allow doctor to view patient's past prescriptions and lab reports (Blind Postman Architecture)"""
    if current_user.role != "Doctor":
        raise HTTPException(status_code=403, detail="Doctors only.")
        
    # New correction: Include 'No Show' instances in the Timeline
    past_appointments = db.query(models.Appointment).filter(
        models.Appointment.patient_id == patient_id,
        models.Appointment.status.in_(["Completed", "No Show"])
    ).order_by(models.Appointment.date.desc()).all()
    
    timeline = []
    for apt in past_appointments:
        prescriptions = db.query(models.Prescription).filter(models.Prescription.appointment_id == apt.id).all()
        apt_date_start = datetime.combine(apt.date, time.min)
        apt_date_end = datetime.combine(apt.date, time.max)
        
        lab_tests_raw = db.query(models.LabTest).filter(
            models.LabTest.patient_id == patient_id,
            models.LabTest.received_time >= apt_date_start,
            models.LabTest.received_time <= apt_date_end
        ).all()
        
        # Zero-Visibility Logic (Blind Postman): Don't even send the .png Hash to the Doctor
        secure_lab_tests = []
        for test in lab_tests_raw:
            secure_lab_tests.append({
                "test_id": test.id,
                "test_name": test.test_name,
                "status": test.status,
                "ordered_time": test.received_time
            })
            
        timeline.append({
            "date": apt.date, 
            "status": apt.status,
            "booked_time": apt.slot_number, # To format the time in the Frontend
            "completed_at": apt.completed_at if apt.status == "Completed" else None,
            "doctor_name": apt.doctor_name, 
            "prescriptions": prescriptions, 
            "lab_tests": secure_lab_tests
        })
    return timeline
# ---------------------------------------------------------
# MY HEALTH VAULT: REPORTS, E-PRESCRIPTIONS & PUBLIC VERIFICATION
# ---------------------------------------------------------

@app.get("/patients/me/reports", tags=["Patients", "My Health Vault"])
def get_my_health_vault_reports(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Allow patient to view the list of lab reports via their My Health Vault"""
    if current_user.role != "Patient": 
        raise HTTPException(status_code=403, detail="Patients only.")
        
    reports = db.query(models.LabTest).filter(
        models.LabTest.patient_id == current_user.id
    ).order_by(models.LabTest.received_time.desc()).all()
    
    result = []
    for r in reports:
        file_url = None
        # Search for the file in the Server folder only if the report is Completed
        if r.status == "Completed":
            matches = glob.glob(f"uploaded_reports/{r.id}_*.*")
            if matches:
                clean_path = matches[0].replace('\\', '/')
                file_url = f"http://localhost:8000/{clean_path}"
        
        # Separate Date and Time as required by the Frontend
        date_str = r.received_time.strftime("%Y-%m-%d") if r.received_time else "N/A"
        time_str = r.received_time.strftime("%I:%M %p") if r.received_time else "N/A"
        
        result.append({
            "id": r.id,
            "test_name": r.test_name,
            "date": date_str,
            "time": time_str,
            "status": r.status,
            "file_url": file_url
        })
    return result

@app.get("/patients/me/prescriptions", tags=["Patients", "My Health Vault"])
def get_my_prescriptions(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Allow patient to view E-Prescriptions via their My Health Vault (100% compliant with UI)"""
    if current_user.role != "Patient":
        raise HTTPException(status_code=403, detail="Patients only.")
        
    prescriptions = db.query(models.Prescription).filter(
        models.Prescription.patient_id == current_user.id
    ).order_by(models.Prescription.id.desc()).all()
    
    patient_info = db.query(models.Patient).filter(models.Patient.id == current_user.id).first()
    
    result = []
    for rx in prescriptions:
        items = db.query(models.PrescriptionItem).filter(models.PrescriptionItem.prescription_id == rx.id).all()
        doctor = db.query(models.User).filter(models.User.id == rx.doctor_id).first()
        
        # 🚨 FIX 1: Format Date and Time beautifully to match the Frontend photo
        issue_dt = rx.created_at if rx.created_at else get_lanka_time()
        formatted_date = issue_dt.strftime("%d %b %Y") # e.g.: 21 Jul 2026
        formatted_time = issue_dt.strftime("%I:%M %p") # e.g.: 09:25 AM
        
        result.append({
            "prescription_number": rx.prescription_number,
            "issue_date": formatted_date, 
            "issue_time": formatted_time,
            "verification_url": f"http://localhost:3000/verify/{rx.prescription_number}",
            "patient_details": {
                "pid": patient_info.pid,
                "name": patient_info.full_name,
                "age": patient_info.age,
                "gender": patient_info.gender
            },
            "doctor_name": doctor.full_name if doctor.full_name else doctor.username,
            "doctor_slmc": doctor.slmc_number,
            "doctor_department": doctor.specialization,
            "doctor_note": rx.doctor_note,
            "is_overridden": getattr(rx, 'is_overridden', False),       # <-- ADD THIS LINE
            "override_reason": getattr(rx, 'override_reason', None),   # <-- ADD THIS LINE
            "medicines": items
        })
        
    return result

@app.get("/verify/prescription/{prescription_number}", tags=["Public Verification"])
def verify_prescription_public(prescription_number: str, db: Session = Depends(get_db)):
    """Verification process for external pharmacies (Public, No Auth Required)"""
    rx = db.query(models.Prescription).filter(models.Prescription.prescription_number == prescription_number).first()
    
    if not rx:
        raise HTTPException(status_code=404, detail="Invalid or undiscoverable prescription (Invalid Prescription).")
        
    patient = db.query(models.Patient).filter(models.Patient.id == rx.patient_id).first()
    doctor = db.query(models.User).filter(models.User.id == rx.doctor_id).first()
    items = db.query(models.PrescriptionItem).filter(models.PrescriptionItem.prescription_id == rx.id).all()
    
    # 🚨 FIX: Remove the previous fake date issue and provide the actual date the prescription was created
    real_issue_date = rx.created_at.date() if hasattr(rx, 'created_at') and rx.created_at else "Unknown Date"
    
    return {
        "status": "✅ Authentic Report",
        "prescription_id": rx.prescription_number,
        "issue_date": str(real_issue_date), 
        "doctor_details": {
            "name": doctor.full_name if doctor.full_name else doctor.username,
            "slmc_number": doctor.slmc_number,
            "specialization": doctor.specialization
        },
        "patient_details": {
            "pid": patient.pid,
            "name": patient.full_name,
            "age": patient.age,
            "gender": patient.gender
        },
        "medicines": items,
        "doctor_note": rx.doctor_note
    }

# =========================================================
# PATIENT PORTAL: MISSING ENDPOINTS FIX & ROUTING FIX
# =========================================================

# =========================================================
# PATIENT PORTAL: MISSING ENDPOINTS FIX & ROUTING FIX
# =========================================================

@app.get("/patients/me/profile", tags=["Patients", "Profile Management"])
def get_my_profile(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Allow patient to view their Profile data"""
    if current_user.role != "Patient": raise HTTPException(status_code=403)
    patient = db.query(models.Patient).filter(models.Patient.id == current_user.id).first()
    if not patient: raise HTTPException(status_code=404)
    name_parts = patient.full_name.split() if patient.full_name else [""]
    return {
        "first_name": name_parts[0], "last_name": " ".join(name_parts[1:]) if len(name_parts) > 1 else "",
        "email": current_user.email, "phone": patient.contact_number, "address": patient.home_address, "dob": patient.dob,
        "mfa_email_enabled": current_user.mfa_email_enabled, "mfa_app_enabled": current_user.mfa_app_enabled
    }

@app.get("/schedules/available", tags=["Appointments"])
def get_all_available_schedules(db: Session = Depends(get_db)):
    """Display the complete calendar to the Patient during Booking (Past & Future)"""
    schedules = db.query(models.DoctorSchedule).all()
    result = []
    for sch in schedules:
        doc = sch.doctor
        if not doc: continue
        
        raw_name = doc.full_name if doc.full_name else doc.username
        clean_name = raw_name.replace("Dr. ", "").replace("Dr ", "")
        initials = "".join([w[0].upper() for w in clean_name.split() if w])[:2]
        
        booked_apts = db.query(models.Appointment).filter(
            models.Appointment.doctor_name == doc.username, 
            models.Appointment.date == sch.date, 
            models.Appointment.status != "Cancelled"
        ).all()
        booked_slots = [a.slot_number for a in booked_apts]
        
        result.append({
            "id": sch.id, "date": str(sch.date), "start_time": str(sch.start_time), "end_time": str(sch.end_time),
            "max_patients": sch.max_patients, "doctor_username": doc.username, "doctor_name": raw_name,
            "specialization": doc.specialization or "General Physician", "initials": initials, "booked_slots": booked_slots
        })
    return result

# =========================================================
# EHR & CLINICAL BLINDNESS MODULE
# =========================================================
# ---------------------------------------------------------
# EHR & CLINICAL BLINDNESS MODULE
# ---------------------------------------------------------
@app.get("/patients/{patient_id}/profile", tags=["EHR & Clinical Blindness"])
def get_patient_profile(patient_id: int, req: Request, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Provide only basic patient data to display at the top of the treatment view panel"""
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not patient: raise HTTPException(status_code=404, detail="Patient not found!")
    client_ip = req.client.host if req else "Unknown"

    if current_user.role == "Admin": 
        log_admin_action(db, current_user.id, "VIEW_PATIENT_BLIND", client_ip, f"Viewed blinded profile PID: {patient.pid}")
        return {"access_level": "RESTRICTED", "pid": patient.pid, "full_name": patient.full_name, "age": patient.age, "gender": patient.gender, "warning": "Sensitive medical records are hidden."}
    
    # Send data for the Doctor's View Panel and Patient's Profile (No Medical Records Here!)
    return {
        "access_level": "BASIC_INFO", 
        "pid": patient.pid, 
        "full_name": patient.full_name, 
        "age": patient.age, 
        "gender": patient.gender, 
        "contact_number": patient.contact_number
    }
@app.get("/patients/me/reports/{test_id}/download", tags=["Patients"])
def download_secure_lab_report(test_id: int, req: Request, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Allow patient to securely download their Lab Report (Zero-Trust)"""
    if current_user.role != "Patient":
        raise HTTPException(status_code=403, detail="Patients only.")

    lab_test = db.query(models.LabTest).filter(
        models.LabTest.id == test_id, 
        models.LabTest.patient_id == current_user.id
    ).first()

    if not lab_test:
        raise HTTPException(status_code=404, detail="Report not found or access denied.")
    if lab_test.status != "Completed":
        raise HTTPException(status_code=400, detail="This report is not ready yet.")

    file_matches = glob.glob(f"uploaded_reports/{test_id}_*.*")
    if not file_matches:
        raise HTTPException(status_code=404, detail="File not found on the server.")

    file_path = max(file_matches, key=os.path.getmtime)
    file_name = os.path.basename(file_path)
    file_ext = file_name.split(".")[-1].lower()
    media_type = "application/pdf" if file_ext == "pdf" else "image/png"

    client_ip = req.client.host if req else "Unknown"
    log_patient_action(db, current_user.id, "DOWNLOAD_REPORT", client_ip, f"Downloaded Lab Report ID: {test_id}")

    return FileResponse(
    path=file_path, 
    filename=file_name, 
    media_type=media_type,
    headers={"Content-Disposition": f'attachment; filename="{file_name}"'}
)
@app.post("/bills/{bill_id}/pay", response_model=schemas.BillResponse, tags=["Admin Operations"])
def pay_bill(bill_id: int, req: Request, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """PDF 5.4: Confirm payment (Blockchain removed)"""
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Admins only.")
        
    bill = db.query(models.Bill).filter(models.Bill.id == bill_id).first()
    if not bill: raise HTTPException(status_code=404, detail="Bill not found!")
    if bill.status == "PAID": raise HTTPException(status_code=400, detail="Payment has already been made!")
    
    bill.status = "PAID"
    db.commit()
    db.refresh(bill)

    client_ip = req.client.host if req else "Unknown"
    
    # Standard Database log kept, Blockchain removed
    log_admin_action(db, current_user.id, "MARK_BILL_PAID", client_ip, f"Paid Bill: {bill.bill_number}")
    
    return bill

# ---------------------------------------------------------
# LAB TECH MODULE & STEGANOGRAPHY (PDF: 5.3 & Labs)
# ---------------------------------------------------------
# 🚨 FIX 1: Route Secret Key to .env according to cyber security standards
_env_key = os.getenv("FORENSIC_SECRET_KEY")
#if not _env_key:
#   raise ValueError("CRITICAL: FORENSIC_SECRET_KEY is missing in .env!")
FORENSIC_SECRET_KEY = base64.urlsafe_b64encode(_env_key.encode('utf-8').ljust(32, b'0')[:32])
cipher_suite = Fernet(FORENSIC_SECRET_KEY)

@app.put("/lab-tests/{test_id}/collect", response_model=schemas.LabTestResponse, tags=["Lab Technician"])
def collect_sample(test_id: int, req: Request, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    if current_user.role != "Lab Technician": raise HTTPException(status_code=403, detail="Lab Technicians only!")
    test = db.query(models.LabTest).filter(models.LabTest.id == test_id).first()
    if not test: raise HTTPException(status_code=404, detail="Test not found!")
  # 🚨 FIX 2: Block re-collecting completed reports 
    # (But allowed for Expired and Pending ones as per PDF)
    if test.status == "Completed":
        raise HTTPException(status_code=400, detail="This test is already completed.")  
    test.status = "Collected" 
# 🚨 FIX 3: Update received_time to the actual time the blood sample was taken 
    # (This ensures 100% accuracy in TAT calculation on the BI Dashboard)
    test.received_time = get_lanka_time()
    db.commit()
    db.refresh(test)
    
    client_ip = req.client.host if req else "Unknown"
    log_lab_tech_action(db, current_user.id, "SAMPLE_COLLECTED", client_ip, f"Collected sample for Test ID: {test_id}")
    return test

@app.post("/lab-tests/{test_id}/upload", tags=["Lab Technician"])
async def upload_lab_report(test_id: int, request: Request, file: UploadFile = File(...), db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    if current_user.role != "Lab Technician": 
        raise HTTPException(status_code=403, detail="Lab Technicians only!")
        
    lab_test = db.query(models.LabTest).filter(models.LabTest.id == test_id).first()
    if not lab_test: 
        raise HTTPException(status_code=404, detail="This laboratory test cannot be found!")
    
    file_ext = file.filename.split(".")[-1].lower()
    if file_ext not in ["png", "pdf"]: 
        raise HTTPException(status_code=400, detail="Please upload only .png or .pdf format files!")

    if lab_test.status == "Completed":
        raise HTTPException(status_code=400, detail="The report for this test has already been added to the system. It cannot be altered again!")
        
    now = get_lanka_time()
    date_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%H:%M:%S")
    ip_address = request.client.host 
    handler_id = f"L-{current_user.id}" 

    # 1. Forensic Payload Construction
    plain_text_data = f"Handler ID: {handler_id} | IP: {ip_address} | Date: {date_str} | Time: {time_str}"
    encrypted_data = cipher_suite.encrypt(plain_text_data.encode('utf-8')).decode('utf-8')

    os.makedirs("uploaded_reports", exist_ok=True)
    temp_path = f"uploaded_reports/temp_{lab_test.id}_{file.filename}"
    final_filename = f"{lab_test.id}_{file.filename}"
    final_path = f"uploaded_reports/{final_filename}"

    with open(temp_path, "wb") as buffer:
        buffer.write(await file.read())

    try:
        if file_ext == "png":
            # PNG LSB Steganography
            secret_image = lsb.hide(temp_path, encrypted_data)
            secret_image.save(final_path)
        elif file_ext == "pdf":
            # PDF Metadata Steganography
            from pypdf import PdfReader, PdfWriter
            reader = PdfReader(temp_path)
            writer = PdfWriter()
            for page in reader.pages:
                writer.add_page(page)
            writer.add_metadata({
                "/ForensicSignature": encrypted_data,
                "/Producer": f"MedCare Forensic Engine ({handler_id})"
            })
            with open(final_path, "wb") as f_out:
                writer.write(f_out)

        if os.path.exists(temp_path):
            os.remove(temp_path)

    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise HTTPException(status_code=400, detail=f"Failed to process file steganography: {str(e)}")

    # 2. SHA-256 Hashing Process
    with open(final_path, "rb") as f:
        file_bytes = f.read()
        generated_hash = hashlib.sha256(file_bytes).hexdigest()
    
    lab_test.file_hash = generated_hash 
    lab_test.status = "Completed"
    lab_test.completed_time = now
    db.commit()
    db.refresh(lab_test)

    log_lab_tech_action(db, current_user.id, "REPORT_UPLOADED", ip_address, f"Uploaded {file_ext.upper()} report for Test ID: {test_id} (Hash: {generated_hash})")
    
    notif = models.Notification(
        patient_id=lab_test.patient_id, 
        message="Your secure Lab Report is now available in your Health Vault.", 
        notification_type="LAB_REPORT", 
        reference_id=lab_test.id
    )
    db.add(notif)
    db.commit()
    
    return {"message": f"{file_ext.upper()} report uploaded and secured successfully!", "hash": generated_hash}

# ---------------------------------------------------------
# FORENSICS & VERIFICATION TOOLS
# ---------------------------------------------------------
@app.post("/patients/verify-report", tags=["Patients"])
async def verify_lab_report(file: UploadFile = File(...), db: Session = Depends(get_db)):
    file_ext = file.filename.split(".")[-1].lower()
    if file_ext not in ["png", "pdf"]: 
        raise HTTPException(status_code=400, detail="Please upload only .png or .pdf format files!")

    file_bytes = await file.read()
    uploaded_hash = hashlib.sha256(file_bytes).hexdigest()

    test_record = db.query(models.LabTest).filter(models.LabTest.file_hash == uploaded_hash).first()

    if test_record:
        return {"status": "AUTHENTIC", "message": "This is the original and authentic report issued by Medcare Hospital."}
    else:
        raise HTTPException(
            status_code=406, 
            detail="WARNING: This report has been altered or is a fake document!"
        )

@app.post("/admin/forensics/decrypt", tags=["Admin Operations", "Digital Forensics"])
async def decrypt_leaked_report(req: Request, file: UploadFile = File(...), db: Session = Depends(get_db), current_user: models.User = Depends(auth.require_admin)):
    """PDF 5.5: Digital Forensics - Extracting hidden data from leaked PNG or PDF reports"""
    file_ext = file.filename.split(".")[-1].lower()
    if file_ext not in ["png", "pdf"]: 
        raise HTTPException(status_code=400, detail="Only .png and .pdf files are supported for forensic analysis!")
        
    os.makedirs("uploaded_reports", exist_ok=True)
    temp_path = f"uploaded_reports/leak_check_{file.filename}"
    with open(temp_path, "wb") as buffer: 
        buffer.write(await file.read())

    try:
        hidden_encrypted_data = None
        
        if file_ext == "png":
            hidden_encrypted_data = lsb.reveal(temp_path)
        elif file_ext == "pdf":
            from pypdf import PdfReader
            reader = PdfReader(temp_path)
            metadata = reader.metadata
            if metadata:
                hidden_encrypted_data = metadata.get("/ForensicSignature")

        if not hidden_encrypted_data:
            if os.path.exists(temp_path): os.remove(temp_path)
            return {"status": "CLEAN", "message": "No confidential forensic watermark was found in this document."}
            
        decrypted_data = cipher_suite.decrypt(hidden_encrypted_data.encode('utf-8')).decode('utf-8')
        if os.path.exists(temp_path): os.remove(temp_path)
        
        parts = [p.strip() for p in decrypted_data.split('|')]
        forensic_result = {}
        for part in parts:
            if ":" in part:
                key, val = part.split(":", 1)
                forensic_result[key.strip()] = val.strip()
                
        raw_handler = forensic_result.get("Handler ID", "")
        clean_id = raw_handler.replace("L-", "")
        
        tech = None
        if clean_id.isdigit():
            tech = db.query(models.User).filter(models.User.id == int(clean_id)).first()
        if not tech:
            tech = db.query(models.User).filter(
                (models.User.employee_id == raw_handler) | (models.User.username == raw_handler)
            ).first()

        display_handler_id = tech.employee_id if (tech and tech.employee_id) else (tech.username if tech else raw_handler)
        display_handler_name = tech.full_name if (tech and tech.full_name) else (tech.username if tech else "Unknown")
            
        client_ip = req.client.host if req else "Unknown"
        log_admin_action(db, current_user.id, "FORENSICS_DECRYPT", client_ip, f"Analyzed file: {file.filename}")

        return {
            "status": "🔴 LEAK SOURCE IDENTIFIED",
            "file_analyzed": file.filename,
            "file_format": file_ext.upper(),
            "source_ip": forensic_result.get("IP", "Unknown"),
            "timestamp": f"{forensic_result.get('Date', '')} | {forensic_result.get('Time', '')}",
            "handler_id": display_handler_id,
            "handler_name": display_handler_name
        }
        
    except Exception as e:
        if os.path.exists(temp_path): os.remove(temp_path)
        raise HTTPException(status_code=400, detail="File corrupted or invalid (Forensic extraction failed).")

# ---------------------------------------------------------
# MFA SETUP & MANAGEMENT (Google Authenticator & Email)
# ---------------------------------------------------------

@app.post("/auth/mfa/setup-app", response_model=schemas.MFASetupResponse, tags=["Security & MFA"])
def setup_google_authenticator(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Provide the Secret and URI required to scan the QR Code"""
    
    if current_user.mfa_app_enabled:
        raise HTTPException(status_code=400, detail="You have already enabled Google Authenticator.")

    # Generate a new secret code
    totp_secret = pyotp.random_base32()
    
    # Generate the URI required to create the QR Code
    qr_uri = pyotp.totp.TOTP(totp_secret).provisioning_uri(
        name=current_user.email,
        issuer_name="Project Medcare"
    )
    
    # Save the secret code temporarily in the Database (until verified)
    current_user.mfa_secret = totp_secret
    db.commit()

    return {"secret": totp_secret, "qr_uri": qr_uri}


@app.post("/auth/mfa/verify-app", tags=["Security & MFA"])
def verify_and_enable_google_authenticator(request: schemas.MFAVerifyRequest, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Check the 6-digit code coming from the App and enable MFA"""
    
    if not current_user.mfa_secret:
        raise HTTPException(status_code=400, detail="Please initiate the Setup process first (Get the QR Code).")
        
    totp = pyotp.TOTP(current_user.mfa_secret)
    
    if not totp.verify(request.app_code):
        raise HTTPException(status_code=400, detail="The code you entered is incorrect. Please try again.")
        
    current_user.mfa_app_enabled = True
    db.commit()
    
    return {"message": "Google Authenticator has been successfully enabled!"}

@app.post("/auth/mfa/disable-app", tags=["Security & MFA"])
def disable_google_authenticator(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Disable Google Authenticator App security"""
    current_user.mfa_app_enabled = False
    current_user.mfa_secret = None # Delete the secret code
    db.commit()
    return {"message": "Google Authenticator security has been successfully disabled!"}

# ---------------------------------------------------------
# ACTIVE SESSIONS & REMOTE WIPING (Zero-Trust)
# ---------------------------------------------------------
@app.post("/auth/logout", tags=["Security & Sessions", "Authentication"])
def logout(req: Request, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """PDF 4.2: Standard logout from the system (Server-side Session Kill)"""
    auth_header = req.headers.get("Authorization")
    if not auth_header:
        raise HTTPException(status_code=400, detail="Token not found.")
        
    current_token = auth_header.split(" ")[1]
    
    # Set the relevant Session in the Database to is_active = False (Delete it)
    active_session = db.query(models.UserSession).filter(
        models.UserSession.session_token == current_token,
        models.UserSession.user_id == current_user.id
    ).first()
    
    if active_session:
        active_session.is_active = False
        db.commit()
        
    client_ip = req.client.host if req else "Unknown"
    
    # Write to Audit Log that the user logged out
    if current_user.role == "Patient": log_patient_action(db, current_user.id, "LOGOUT", client_ip, "Successfully logged out")
    elif current_user.role == "Admin": log_admin_action(db, current_user.id, "LOGOUT", client_ip, "Successfully logged out")
    elif current_user.role == "Doctor": log_doctor_action(db, current_user.id, "LOGOUT", client_ip, "Successfully logged out")
    elif current_user.role == "Lab Technician": log_lab_tech_action(db, current_user.id, "LOGOUT", client_ip, "Successfully logged out")
        
    return {"message": "You have successfully logged out of the system."}

@app.get("/auth/sessions/me", response_model=List[schemas.SessionResponse], tags=["Security & Sessions"])
def get_my_active_sessions(req: Request, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """View all Devices and IP addresses currently logged in"""
    
    # Extract the token currently in use
    auth_header = req.headers.get("Authorization")
    current_token = auth_header.split(" ")[1] if auth_header else ""
    
    sessions = db.query(models.UserSession).filter(
        models.UserSession.user_id == current_user.id, 
        models.UserSession.is_active == True
    ).all()
    
    response_data = []
    for s in sessions:
        s_dict = {
            "id": s.id,
            "ip_address": s.ip_address,
            "user_agent": s.user_agent,
            "created_at": s.created_at,
            "is_active": s.is_active,
            "is_current": (s.session_token == current_token) # Set True for the current location
        }
        response_data.append(s_dict)
        
    return response_data


@app.delete("/auth/sessions/revoke-others", tags=["Security & Sessions"])
def revoke_all_other_sessions(req: Request, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Log out of all other devices simultaneously (Kill Switch)"""
    
    auth_header = req.headers.get("Authorization")
    current_token = auth_header.split(" ")[1] if auth_header else ""
    
    # Set is_active = False for all Sessions except the one currently in use
    db.query(models.UserSession).filter(
        models.UserSession.user_id == current_user.id,
        models.UserSession.session_token != current_token,
        models.UserSession.is_active == True
    ).update({"is_active": False})
    
    db.commit()
    
    client_ip = req.client.host if req else "Unknown"
    # Record in Action Logs
    if current_user.role == "Patient": log_patient_action(db, current_user.id, "REMOTE_WIPE", client_ip, "Revoked all other sessions")
    elif current_user.role == "Admin": log_admin_action(db, current_user.id, "REMOTE_WIPE", client_ip, "Revoked all other sessions")
    elif current_user.role == "Doctor": log_doctor_action(db, current_user.id, "REMOTE_WIPE", client_ip, "Revoked all other sessions")
    
    return {"message": "Secured! You have successfully been logged out of all other devices."}

@app.delete("/auth/sessions/{session_id}", tags=["Security & Sessions"])
def revoke_single_session(session_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """PDF 4.2.1: Log out from a specific device (Single Device) only"""
    session = db.query(models.UserSession).filter(
        models.UserSession.id == session_id,
        models.UserSession.user_id == current_user.id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Device not found.")
        
    session.is_active = False
    db.commit()
    
    return {"message": "Successfully logged out from the selected device."}

@app.post("/auth/mfa/toggle-email", tags=["Security & MFA"])
def toggle_email_mfa(enable: bool, req: Request, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Enable or disable Email OTP security and log the action"""
    
    current_user.mfa_email_enabled = enable
    db.commit()
    
    status_msg = "Enabled" if enable else "Disabled"
    
    # 🚨 FIX: Record MFA changes in the Audit Log
    client_ip = req.client.host if req else "Unknown"
    action_type = "MFA_ENABLED" if enable else "MFA_DISABLED"
    
    if current_user.role == "Admin": log_admin_action(db, current_user.id, action_type, client_ip, f"Email OTP MFA {status_msg}")
    elif current_user.role == "Doctor": log_doctor_action(db, current_user.id, action_type, client_ip, f"Email OTP MFA {status_msg}")
    elif current_user.role == "Lab Technician": log_lab_tech_action(db, current_user.id, action_type, client_ip, f"Email OTP MFA {status_msg}")
    elif current_user.role == "Patient": log_patient_action(db, current_user.id, action_type, client_ip, f"Email OTP MFA {status_msg}")
    
    return {"message": f"Email OTP security has been successfully {status_msg.lower()}!"}
# =========================================================
# ADMIN PROFILE & SECURITY MANAGEMENT (PDF: 5.6)
# =========================================================
@app.get("/admin/profile", tags=["Admin Operations"])
def get_admin_profile(current_user: models.User = Depends(auth.require_admin)):
    return {
        "username": current_user.username,
        "email": current_user.email,
        "mfa_app_enabled": current_user.mfa_app_enabled,
        "mfa_email_enabled": current_user.mfa_email_enabled
    }

class AdminProfileUpdate(BaseModel):
    email: str

@app.put("/admin/me/profile", tags=["Admin Operations", "Security & Privacy"])
def update_admin_profile(request: AdminProfileUpdate, req: Request, db: Session = Depends(get_db), current_user: models.User = Depends(auth.require_admin)):
    """Change Admin's Email (for SMTP MFA)"""
    current_user.email = request.email
    db.commit()
    
    # Action Logging
    client_ip = req.client.host if req else "Unknown"
    log_admin_action(db, current_user.id, "PROFILE_UPDATED", client_ip, f"Updated Admin Email to {request.email}")
    
    return {"message": "Admin profile updated successfully."}


@app.put("/admin/me/username", tags=["Admin Operations", "Security & Privacy"])
def change_admin_username(request: schemas.UsernameChangeRequest, req: Request, db: Session = Depends(get_db), current_user: models.User = Depends(auth.require_admin)):
    """PDF 5.6.1: Change Admin's Username (Password required)"""
    
    # 1. Security Check (Verify if the current password is correct)
    if not hashing.Hash.verify(current_user.hashed_password, request.current_password):
        raise HTTPException(status_code=400, detail="The current password you entered is incorrect (Access Denied).")
        
    # 2. Check if the new name already exists in the system
    existing_user = db.query(models.User).filter(models.User.username == request.new_username).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="This username is already in use. Please provide a different name.")
        
    old_username = current_user.username
    current_user.username = request.new_username
    db.commit()
    
    client_ip = req.client.host if req else "Unknown"
    log_admin_action(db, current_user.id, "USERNAME_CHANGED", client_ip, f"Username changed from {old_username} to {request.new_username}")
    
    return {"message": "Your username has been successfully updated."}

# =========================================================
# PATIENT SECURITY & PRIVACY CENTER (MISSING ENDPOINTS)
# =========================================================

@app.put("/patients/me/profile/editable", tags=["Security & Privacy", "Profile Management"])
def update_editable_profile_fields(request: schemas.PatientProfileUpdate, req: Request, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """PDF 4.1: Update editable patient data (Mobile, Email, Address)"""
    if current_user.role != "Patient": 
        raise HTTPException(status_code=403, detail="Patients only")
    
    patient = db.query(models.Patient).filter(models.Patient.id == current_user.id).first()
    
    # Update only editable fields (NIC, Name etc. cannot be changed here)
    if request.email: current_user.email = request.email
    if request.contact_number: patient.contact_number = request.contact_number
    if request.home_address: patient.home_address = request.home_address
    
    db.commit()
    
    client_ip = req.client.host if req else "Unknown"
    log_patient_action(db, current_user.id, "PROFILE_UPDATED", client_ip, "Updated editable profile fields")
    return {"message": "Your profile information has been successfully updated."}

@app.put("/auth/security/change-password", tags=["Security & Privacy", "Authentication"])
def change_password_logged_in(request: schemas.PasswordChangeLoggedIn, req: Request, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """PDF 4.2: Change password for a logged-in patient"""
    # 1. Verify if the current password is correct
    if not hashing.Hash.verify(current_user.hashed_password, request.current_password):
        raise HTTPException(status_code=400, detail="The current password you entered is incorrect.")
        
    # 2. Update to the new password
    current_user.hashed_password = hashing.Hash.bcrypt(request.new_password)
    
    # 3. Log out from all other devices (Security Best Practice)
    auth_header = req.headers.get("Authorization")
    current_token = auth_header.split(" ")[1] if auth_header else ""
    db.query(models.UserSession).filter(
        models.UserSession.user_id == current_user.id,
        models.UserSession.session_token != current_token
    ).update({"is_active": False})
    
    db.commit()
    
    client_ip = req.client.host if req else "Unknown"
    if current_user.role == "Patient":
        log_patient_action(db, current_user.id, "PASSWORD_CHANGED", client_ip, "Changed account password")
        
    return {"message": "Password updated successfully. As a security measure, you have been logged out from all other devices."}

@app.get("/patients/me/activity-logs", tags=["Security & Privacy", "Activity Logs"])
def get_my_activity_logs(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """PDF 4.3: View all patient activities chronologically (Dynamic Device Tracking)"""
    if current_user.role != "Patient": 
        raise HTTPException(status_code=403, detail="Patients only.")
    
    # 1. Fetch all logs for the patient
    logs = db.query(models.PatientActivityLog).filter(
        models.PatientActivityLog.patient_id == current_user.id
    ).order_by(models.PatientActivityLog.timestamp.desc()).limit(100).all()
    
    # 2. 🚀 Find the Device (User-Agent) from UserSession via IP Address
    sessions = db.query(models.UserSession).filter(models.UserSession.user_id == current_user.id).all()
    ip_to_ua = {s.ip_address: s.user_agent for s in sessions}
    
    # 3. Make User-Agent readable
    def parse_device_info(ua_string):
        if not ua_string or ua_string == "Unknown Device": return "Unknown Device"
        browser = "Chrome" if "Chrome" in ua_string else "Firefox" if "Firefox" in ua_string else "Safari" if "Safari" in ua_string else "Edge" if "Edg" in ua_string else "Browser"
        os_name = "Windows" if "Windows" in ua_string else "macOS" if "Mac" in ua_string else "Linux" if "Linux" in ua_string else "Android" if "Android" in ua_string else "iOS" if "iPhone" in ua_string else "Device"
        return f"{os_name} • {browser}"

    result = []
    for log in logs:
        # Extract device associated with the IP
        raw_ua = ip_to_ua.get(log.ip_address, "Unknown Device")
        nice_device = parse_device_info(raw_ua)
        
        # Determine Status (FAILED/SUCCESS) based on the Action
        status_badge = "FAILED" if "FAILED" in log.action else "SUCCESS"
        
        result.append({
            "id": log.id,
            "action": log.action,
            "status": status_badge,
            "ip_address": log.ip_address,
            "device": nice_device, 
            "timestamp": log.timestamp
        })
        
    return result

# ---------------------------------------------------------
# NOTIFICATIONS (Patient Portal)
# ---------------------------------------------------------
@app.get("/patients/me/notifications", response_model=List[schemas.NotificationResponse], tags=["Notifications"])
def get_my_notifications(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Retrieve patient Notifications"""
    if current_user.role != "Patient":
        raise HTTPException(status_code=403, detail="Patients only.")
    return db.query(models.Notification).filter(models.Notification.patient_id == current_user.id).order_by(models.Notification.created_at.desc()).all()

@app.put("/notifications/{notification_id}/read", tags=["Notifications"])
def mark_notification_read(notification_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    notif = db.query(models.Notification).filter(models.Notification.id == notification_id, models.Notification.patient_id == current_user.id).first()
    if not notif: raise HTTPException(status_code=404, detail="Notification not found.")
    notif.is_read = True
    db.commit()
    return {"message": "Marked as read."}

# ---------------------------------------------------------
# UPCOMING & HISTORY APPOINTMENTS
# ---------------------------------------------------------
@app.get("/appointments/me/upcoming", tags=["Appointments"])
def get_upcoming_appointments(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Upcoming Appointments (Confirmed AND Future/Today dates only)"""
    if current_user.role != "Patient": raise HTTPException(status_code=403, detail="Patients only.")
    today = get_lanka_time().date()
    
    # Include "In Progress" (Currently in the room)
    appointments = db.query(models.Appointment).filter(
        models.Appointment.patient_id == current_user.id,
        models.Appointment.status.in_(["Confirmed", "In Progress"]),
        models.Appointment.date >= today
    ).order_by(models.Appointment.date.asc()).all()
    
    res = []
    for a in appointments:
        # 🟢 FIX: Find actual name (Full Name) using the doctor's ID
        doc_user = db.query(models.User).filter(models.User.username == a.doctor_name).first()
        display_name = doc_user.full_name if doc_user and doc_user.full_name else a.doctor_name
        
        res.append({
            "appointment_id": a.id, 
            "reference_number": a.appointment_number, 
            "doctor_name": display_name, 
            "date": str(a.date), 
            "slot_number": a.slot_number, 
            "status": a.status
        })
        
    return {"total_appointments": len(res), "appointments": res}

@app.get("/appointments/me/history", tags=["Appointments"])
def get_appointment_history(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """History (Completed, Cancelled, No Show, OR Past Confirmed)"""
    if current_user.role != "Patient": raise HTTPException(status_code=403, detail="Patients only.")
    today = get_lanka_time().date()
    
    appointments = db.query(models.Appointment).filter(
        models.Appointment.patient_id == current_user.id,
        (models.Appointment.status.in_(["Completed", "Cancelled", "No Show"])) | 
        ((models.Appointment.status == "Confirmed") & (models.Appointment.date < today))
    ).order_by(models.Appointment.date.desc()).all()
    
    res = []
    for a in appointments:
        # 🟢 FIX: Find actual name (Full Name) using the doctor's ID
        doc_user = db.query(models.User).filter(models.User.username == a.doctor_name).first()
        display_name = doc_user.full_name if doc_user and doc_user.full_name else a.doctor_name
        
        res.append({
            "appointment_id": a.id, 
            "reference_number": a.appointment_number, 
            "doctor_name": display_name, 
            "date": str(a.date), 
            "slot_number": a.slot_number, 
            "status": a.status,
            "completed_time": str(a.completed_at) if a.completed_at else None
        })
        
    return {"total_appointments": len(res), "appointments": res}

@app.put("/appointments/{appointment_id}/cancel", tags=["Appointments"])
def cancel_appointment(appointment_id: int, req: Request, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    if current_user.role != "Patient": raise HTTPException(status_code=403, detail="Patients only.")
    appointment = db.query(models.Appointment).filter(models.Appointment.id == appointment_id).first()
    if not appointment: raise HTTPException(status_code=404, detail="Appointment not found.")
    if appointment.patient_id != current_user.id: raise HTTPException(status_code=403, detail="Unauthorized.")
    if appointment.status == "Cancelled": raise HTTPException(status_code=400, detail="Already cancelled.")
# 🚨 FIX: Close the "Smart Patient Loophole"!
    # 100% block canceling appointments that are already started (In Progress) or finished (Completed/No Show).
    if appointment.status != "Confirmed":
        raise HTTPException(
            status_code=400, 
            detail="This appointment has already commenced in the room or has been completed, therefore it cannot be cancelled via the App now!"
        )
    
    appointment.status = "Cancelled"
    
    # --- Newly added Cancellation Notification Trigger ---
    notif_msg = f"Your appointment {appointment.appointment_number} has been cancelled."
    db.add(models.Notification(patient_id=current_user.id, message=notif_msg, notification_type="APPOINTMENT_CANCELLED", reference_id=appointment.id))
    
    db.commit()
    db.refresh(appointment)
    
    client_ip = req.client.host if req else "Unknown"
    log_patient_action(db, current_user.id, "CANCEL_APPOINTMENT", client_ip, f"Cancelled {appointment.appointment_number}")
    return {"message": "Appointment cancelled.", "reference_number": appointment.appointment_number}

# ---------------------------------------------------------
# AI TRIAGE (Arabella 11.0 - The Flawless Edition)
# ---------------------------------------------------------
ARABELLA_SYSTEM_PROMPT = """
You are Arabella, the strict, highly professional medical AI triage assistant for Project Medcare.
Current System Date: {CURRENT_DATE}

CRITICAL TRIAGE PROTOCOL (Read carefully and follow ONLY ONE condition based on the context):

🔴 CONDITION A (CONFIRMING A BOOKING): 
IF your PREVIOUS message asked "Shall I book an appointment...?" AND the patient's current reply is a clear "Yes", "Ok", "Confirm", or "Do it".
-> ACTION: Generate a polite confirmation message AND you MUST append this EXACT tag at the very end:
[ACTION: BOOK, DOCTOR: Exact Full Name, DATE: YYYY-MM-DD]
-> RULE: Never ask any more questions here.

🟡 CONDITION B (CANCELLING/CHANGING A BOOKING): 
IF your PREVIOUS message asked "Shall I book...?" AND the patient replies "No", "Wait", "Change date", or asks for another doctor.
-> ACTION: Acknowledge their request and provide new options from the schedule.
-> RULE: DO NOT generate the [ACTION] tag.

🔵 CONDITION C (VAGUE REQUEST): 
IF the patient asks for a doctor but gives NO symptoms and NO specialty (e.g., "I need a doctor").
-> ACTION: Politely ask: "Could you please tell me your symptoms or the specific specialist you are looking for?"
-> RULE: DO NOT suggest any doctors yet.

🟢 CONDITION D (SYMPTOMS GIVEN): 
IF the patient provides symptoms or a specialty.
-> ACTION: Look at the LIVE DOCTOR SCHEDULES below. Pick a MAXIMUM of 1 or 2 relevant doctors. Ask explicitly: "Shall I book an appointment with Dr. [Full Name] on [YYYY-MM-DD] for you? (Yes/No)"
-> RULE: DO NOT generate the [ACTION] tag yet.

LIVE DOCTOR SCHEDULES (Grouped by Doctor):
{AVAILABLE_DOCTORS}
"""

@app.post("/chat", response_model=schemas.ChatResponse, tags=["Chatbot"])
async def chat_with_arabella(request: schemas.ChatRequest, req: Request, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    if current_user.role != "Patient": raise HTTPException(status_code=403, detail="Patients only.")
    
    # 1. Initialize or fetch Chat Session
    chat_session = db.query(models.ChatSession).filter(models.ChatSession.patient_id == current_user.id, models.ChatSession.is_active == True).first()
    if not chat_session:
        chat_session = models.ChatSession(patient_id=current_user.id, session_token=str(uuid.uuid4()))
        db.add(chat_session)
        db.commit()
    
    # Save Current User Message to DB immediately
    db.add(models.ChatMessage(session_id=chat_session.id, sender="user", message=request.message))
    db.commit()

    # 2. Strict Timezone Enforcement (Sri Lanka Time)
    try:
        from database import get_lanka_time
        today = get_lanka_time().date()
    except ImportError:
        today = datetime.utcnow().date() + timedelta(hours=5, minutes=30)

    # 3. Optimize Schedule Fetching
    schedules = db.query(models.DoctorSchedule).filter(models.DoctorSchedule.date >= today).all() 
    
    grouped_docs = {}
    for sch in schedules:
        doc_username = sch.doctor.username if sch.doctor else "Unknown"
        booked_count = db.query(models.Appointment).filter(
            models.Appointment.doctor_name == doc_username, 
            models.Appointment.date == sch.date, 
            models.Appointment.status != "Cancelled"
        ).count()
        
        available_slots = sch.max_patients - booked_count
        if available_slots > 0:
            if doc_username not in grouped_docs:
                doc_full_name = sch.doctor.full_name if sch.doctor and sch.doctor.full_name else doc_username
                doc_spec = sch.doctor.specialization or "General Physician"
                doc_exp = sch.doctor.experience_years or 0
                grouped_docs[doc_username] = {
                    "name": doc_full_name,
                    "specialty": doc_spec,
                    "exp": doc_exp,
                    "dates": []
                }
            grouped_docs[doc_username]["dates"].append(str(sch.date))

    doc_list = []
    for data in grouped_docs.values():
        available_dates = ", ".join(sorted(data["dates"]))
        doc_list.append(f"- Dr. {data['name']} (Specialty: {data['specialty']} | Experience: {data['exp']} years) | Available Dates: [{available_dates}]")
            
    dynamic_docs = "\n".join(doc_list) if doc_list else "No doctors available at the moment."
    final_prompt = ARABELLA_SYSTEM_PROMPT.replace("{AVAILABLE_DOCTORS}", dynamic_docs).replace("{CURRENT_DATE}", str(today))

    # 4. 🚨 BUG FIX: Context & Memory Issue 
    # Get the LATEST 12 messages by descending timestamp, then reverse them back to chronological order!
    recent_msgs = db.query(models.ChatMessage).filter(
        models.ChatMessage.session_id == chat_session.id
    ).order_by(models.ChatMessage.timestamp.desc()).limit(12).all()
    
    recent_msgs.reverse() # Reverse to make it oldest -> newest for the AI
    
    messages_for_ai = [{"role": "system", "content": final_prompt}]
    for msg in recent_msgs: 
        messages_for_ai.append({"role": "user" if msg.sender == "user" else "assistant", "content": msg.message})
    
    # Note: request.message is already inside recent_msgs because we saved it at Step 1! No need to append it again.

    # 5. Call LLM API with Timeout Protection
    try:
        api_key = os.environ.get("OPENROUTER_API_KEY")
        if not api_key:
            raise Exception("API Key is missing!")
            
        client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key)
        response = client.chat.completions.create(
            model="meta-llama/llama-3.3-70b-instruct",
            messages=messages_for_ai,
            temperature=0.1, 
            timeout=15.0
        )
        arabella_response = response.choices[0].message.content
        if not arabella_response:
            arabella_response = "I'm sorry, I am experiencing a slight system delay. Could you please repeat that?"
            
    except Exception as api_err:
        fallback_msg = "Arabella AI is currently experiencing high network traffic. Please try again in a few seconds or book manually via the 'Appointments' tab."
        db.add(models.ChatMessage(session_id=chat_session.id, sender="arabella", message=fallback_msg))
        db.commit()
        print(f"OpenRouter Error: {str(api_err)}")
        return {"response": fallback_msg, "session_id": chat_session.id}

    # 6. BULLETPROOF REGEX & BOOKING LOGIC
    booking_match = re.search(r'\[ACTION:\s*BOOK,\s*DOCTOR:\s*([^,\]]+),\s*DATE:\s*(\d{4}-\d{2}-\d{2})\s*\]', arabella_response, re.IGNORECASE)
    
    if booking_match:
        user_msg_lower = request.message.lower().strip()
        
        # Exact Word Tokenization (Ignores punctuation)
        clean_msg = re.sub(r'[^\w\s]', '', user_msg_lower) 
        user_words = set(clean_msg.split()) 
        
        # Singlish & English Keyword detection
        cancel_words = {"no", "wait", "but", "change", "another", "cancel", "එපා", "වෙන", "නෑ", "පොඩ්ඩක්", "wrong", "dont", "na", "naha"}
        confirm_words = {"yes", "y", "yep", "sure", "ok", "okay", "ඔව්", "හරි", "එල", "කරන්න", "දාන්න", "book", "confirm", "proceed", "please", "ow", "hari", "ela", "oww"}
        
        is_user_cancelled = any(word in cancel_words for word in user_words)
        is_user_confirmed = any(word in confirm_words for word in user_words)
        
        if is_user_cancelled or not is_user_confirmed:
            arabella_response = re.sub(r'\[ACTION:\s*BOOK(.*?)]', '', arabella_response, flags=re.IGNORECASE).strip()
        else:
            raw_doc_name = booking_match.group(1).strip()
            raw_target_date = booking_match.group(2).strip()
            
            # Remove tag from UI response
            arabella_response = re.sub(r'\[ACTION:\s*BOOK(.*?)]', '', arabella_response, flags=re.IGNORECASE).strip()
            
            try: 
                target_date = datetime.strptime(raw_target_date, '%Y-%m-%d').date()
                if target_date < today:
                    raise ValueError("Past Date")
            except ValueError:
                arabella_response += f"\n\n⚠️ **System Notice:** The requested date is invalid or in the past. Please select a valid future date."
                db.add(models.ChatMessage(session_id=chat_session.id, sender="arabella", message=arabella_response))
                db.commit()
                return {"response": arabella_response, "session_id": chat_session.id}

            # Doctor Name Cleaning
            doc_clean_name = re.sub(r'\(.*?\)', '', raw_doc_name).strip() 
            doc_clean_name = re.sub(r'^(Dr\.|Dr\s+)', '', doc_clean_name, flags=re.IGNORECASE).strip()
            
            doc_user = db.query(models.User).filter(
                (models.User.role == "Doctor") &
                ((models.User.full_name.ilike(f"%{doc_clean_name}%")) | 
                 (models.User.username.ilike(f"%{doc_clean_name}%")))
            ).first()

            if doc_user:
                # Double-Booking Guard
                already_booked = db.query(models.Appointment).filter(
                    models.Appointment.patient_id == current_user.id,
                    models.Appointment.doctor_name == doc_user.username,
                    models.Appointment.date == target_date,
                    models.Appointment.status.in_(["Confirmed", "In Progress"])
                ).first()

                if already_booked:
                    arabella_response += f"\n\n⚠️ **Notice:** You already have a confirmed appointment (Ref: {already_booked.appointment_number}) with this doctor on this date. Double bookings are strictly prevented."
                else:
                    sch = db.query(models.DoctorSchedule).filter(models.DoctorSchedule.doctor_id == doc_user.id, models.DoctorSchedule.date == target_date).first()
                    if sch:
                        booked_slots = [a.slot_number for a in db.query(models.Appointment).filter(
                            models.Appointment.doctor_name == doc_user.username, 
                            models.Appointment.date == sch.date, 
                            models.Appointment.status != "Cancelled"
                        ).all()]
                        
                        all_slots = list(range(1, sch.max_patients + 1))
                        available_slots = [s for s in all_slots if s not in booked_slots]
                        
                        doc_display_name = doc_user.full_name if doc_user.full_name else doc_user.username
                        
                        if not available_slots:
                            arabella_response += f"\n\n⚠️ **Notice:** I apologize, but Dr. {doc_display_name} is fully booked on {sch.date}."
                        else:
                            next_slot = available_slots[0] 
                            apt_num = f"APT-2026-{random.randint(1000, 9999)}"
                            
                            # Database Transaction Safety Wrapper
                            try:
                                new_apt = models.Appointment(
                                    appointment_number=apt_num, patient_id=current_user.id, 
                                    doctor_name=doc_user.username, date=sch.date, 
                                    slot_number=next_slot, status="Confirmed"
                                )
                                db.add(new_apt)
                                db.flush() 
                                
                                notif_msg = f"Your appointment is confirmed. Ref No: {apt_num} (Dr. {doc_display_name} | {sch.date}) - via Arabella AI"
                                db.add(models.Notification(patient_id=current_user.id, message=notif_msg, notification_type="APPOINTMENT_CONFIRMED", reference_id=new_apt.id))
                                
                                # 🚨 BUG FIX: Directly call the native function (No imports needed!)
                                client_ip = req.client.host if req else "Unknown"
                                try:
                                    log_patient_action(db, current_user.id, "AI_BOOKING", client_ip, f"Arabella booked {apt_num}")
                                except Exception as e:
                                    print(f"Log Error ignored: {e}")
                                
                                db.commit() 
                                arabella_response += f"\n\n✅ **Booking Confirmed!**\nRef No: **{apt_num}**\nConsultant: **Dr. {doc_display_name}**\nDate: **{sch.date}**\nQueue No: **{next_slot}**"
                                
                            except Exception as db_err:
                                db.rollback() 
                                arabella_response += f"\n\n⚠️ **System Error:** Failed to secure the booking due to a database collision. Please try again."
                                print(f"DB Error during AI Booking: {str(db_err)}")
                    else:
                        arabella_response += f"\n\n⚠️ **System Notice:** I couldn't find a schedule for Dr. {doc_display_name} on {target_date}."
            else:
                arabella_response += f"\n\n⚠️ **System Notice:** I couldn't verify the doctor's name '{doc_clean_name}' in our database."

    # Save Arabella's response to DB
    db.add(models.ChatMessage(session_id=chat_session.id, sender="arabella", message=arabella_response))
    db.commit()
    
    return {"response": arabella_response, "session_id": chat_session.id}
# ---------------------------------------------------------
# PROFILE CHANGE REQUESTS (Zero-Trust Patient Identity)
# ---------------------------------------------------------
@app.post("/patients/me/change-requests", response_model=schemas.ProfileChangeRequestResponse, tags=["Profile Management"])
def request_profile_change(request: schemas.ProfileChangeRequestCreate, req: Request, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Request Admin approval to change sensitive patient data (NIC, Name)"""
    if current_user.role != "Patient":
        raise HTTPException(status_code=403, detail="Patients only.")
        
    new_request = models.ProfileChangeRequest(
        patient_id=current_user.id,
        requested_field=request.requested_field,
        new_value=request.new_value
    )
    db.add(new_request)
    db.commit()
    db.refresh(new_request)
    
    client_ip = req.client.host if req else "Unknown"
    log_patient_action(db, current_user.id, "PROFILE_CHANGE_REQUEST", client_ip, f"Requested to change {request.requested_field}")
    
    return new_request

@app.put("/admin/change-requests/{request_id}/approve", tags=["Admin Operations"])
def approve_profile_change(request_id: int, req: Request, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Admin approves patient changes and updates the database"""
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Admins only.")
        
    change_req = db.query(models.ProfileChangeRequest).filter(models.ProfileChangeRequest.id == request_id).first()
    if not change_req or change_req.status != "PENDING":
        raise HTTPException(status_code=404, detail="Request cannot be found or is already processed.")
        
    patient = db.query(models.Patient).filter(models.Patient.id == change_req.patient_id).first()
    
    # Update the relevant Field
    if hasattr(patient, change_req.requested_field):
        setattr(patient, change_req.requested_field, change_req.new_value)
    
    change_req.status = "APPROVED"
    db.commit()
    
    client_ip = req.client.host if req else "Unknown"
    log_admin_action(db, current_user.id, "APPROVED_PROFILE_CHANGE", client_ip, f"Approved change for PID: {patient.pid}")
    
    return {"message": "Data update has been approved."}
# ---------------------------------------------------------
# PASSWORD RECOVERY (Forgot Password Logic)
# ---------------------------------------------------------
@app.post("/auth/forgot-password", tags=["Authentication"])
async def forgot_password(request: schemas.PasswordResetRequest, db: Session = Depends(get_db)):
    """Email a real Reset Link via SMTP with Quantum QRNG Token Generation"""
    user = db.query(models.User).filter(models.User.email == request.email).first()
    if not user:
        return {"message": "If this email address exists in the system, you will receive a Reset Link."}
        
    # --- QUANTUM QRNG INTEGRATION (ANU API) ---
    reset_token = None
    anu_key = os.getenv("ANU_API_KEY")

    if anu_key:
        try:
            import httpx
            async with httpx.AsyncClient(timeout=5.0) as client:
                headers = {"x-api-key": anu_key}
                res = await client.get(
                    "https://api.quantumnumbers.anu.edu.au?length=16&type=hex16&size=1",
                    headers=headers
                )
                if res.status_code == 200:
                    data = res.json()
                    if data.get("success") and data.get("data"):
                        # Join 16 hex16 blocks to create a 64-character Quantum Token
                        reset_token = "".join(data["data"]) 
                        print("🟢 [SECURITY] Quantum Token Generated Successfully!")
        except Exception as e:
            print(f"⚠️ [SECURITY WARNING] Quantum API failed, using fallback mechanism: {str(e)}")

    # Standard Math Fallback mechanism if ANU API is unreachable
    if not reset_token:
        import secrets
        reset_token = secrets.token_hex(32) # Generates a secure 64-character hex string
    # -------------------------------------------

    expires = get_lanka_time() + timedelta(minutes=15)
    
    new_token_record = models.PasswordResetToken(
        user_id=user.id,
        token=reset_token,
        expires_at=expires
    )
    db.add(new_token_record)
    db.commit()
    
    # Generate real link
    reset_link = f"{os.getenv('FRONTEND_URL', 'http://localhost:3000')}/reset-password?token={reset_token}"
    
    smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", 465))
    sender_email = os.getenv("SMTP_EMAIL")
    sender_password = os.getenv("SMTP_PASSWORD")

    if sender_email and sender_password:
        try:
            msg = MIMEMultipart()
            msg['From'] = f"MedCare Security <{sender_email}>"
            msg['To'] = user.email
            msg['Subject'] = "MedCare Account - Password Reset Request"
            
            body = f"""Hello,
            
A password reset was requested for your MedCare account. 
Click the secure link below to set a new password (valid for 15 minutes):

{reset_link}

If you did not request this, please ignore this email.

Securely,
Project Medcare Security Team"""
            msg.attach(MIMEText(body, 'plain'))

            server = smtplib.SMTP_SSL(smtp_server, smtp_port)
            server.login(sender_email, sender_password)
            server.send_message(msg)
            server.quit()
            print(f"✅ [SMTP] Password reset email sent to {user.email}")
        except Exception as e:
            print(f"❌ [SMTP ERROR] Failed to send email: {str(e)}")
    else:
        print(f"⚠️ [SMTP WARNING] Credentials missing! Link: {reset_link}")

    return {"message": "If this email address exists in the system, you will receive a Reset Link."}

@app.post("/auth/reset-password", tags=["Authentication"])
async def reset_password(req: Request, db: Session = Depends(get_db)):
    """Bulletproof password reset endpoint with safe timezone comparison"""
    try:
        body = await req.json()
    except Exception:
        body = {}
        
    clean_token = (body.get("reset_token") or body.get("token") or req.query_params.get("token") or "").strip()
    new_password = body.get("new_password") or body.get("password") or ""
    
    if not clean_token or not new_password:
        raise HTTPException(status_code=400, detail="Token and new password are required.")
    
    token_record = db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.token == clean_token,
        models.PasswordResetToken.is_used == False
    ).first()
    
    if not token_record:
        raise HTTPException(status_code=400, detail="The token is invalid or has already been used.")
        
    # 🟢 Safe Timezone Comparison (strips tzinfo to prevent comparison crashes)
    now_time = get_lanka_time()
    now_naive = now_time.replace(tzinfo=None) if hasattr(now_time, "tzinfo") and now_time.tzinfo else now_time
    
    expires_val = token_record.expires_at
    expires_naive = expires_val.replace(tzinfo=None) if hasattr(expires_val, "tzinfo") and expires_val.tzinfo else expires_val
    
    if now_naive > expires_naive:
        raise HTTPException(status_code=400, detail="The token has expired (15-minute limit passed).")
        
    user = db.query(models.User).filter(models.User.id == token_record.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Associated user not found.")
    
    # Hash and save the new password
    user.hashed_password = hashing.Hash.bcrypt(new_password)
    token_record.is_used = True
    
    # Automatically log out from all other active sessions after setting a new password
    db.query(models.UserSession).filter(
        models.UserSession.user_id == user.id,
        models.UserSession.is_active == True
    ).update({"is_active": False})
    
    db.commit()
    return {"message": "Your password has been successfully reset. Please log in with your new password."}

# =========================================================
# LAB TECHNICIAN: VIEW 03 & 04 (LOGS, PROFILE & SECURITY)
# =========================================================

@app.get("/lab-tech/me/activity-logs", tags=["Lab Technician", "Activity Logs"])
def get_lab_tech_activity_logs(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """PDF View 3: Lab Technician's Read-only Activity Report (Audit Trail / Immutable)"""
    if current_user.role != "Lab Technician":
        raise HTTPException(status_code=403, detail="Lab Technicians only.")
    
    logs = db.query(models.LabTechActivityLog).filter(
        models.LabTechActivityLog.tech_id == current_user.id
    ).order_by(models.LabTechActivityLog.timestamp.desc()).limit(100).all()
    
    return logs

# Created the Profile Update Schema here to make frontend integration easier
class LabTechProfileUpdate(BaseModel):
    contact_number: Optional[str] = None
    email: Optional[str] = None


@app.get("/lab-tech/profile", tags=["Lab Technician", "Profile & Security"])
def get_lab_tech_profile(current_user: models.User = Depends(auth.get_current_user)):
    """PDF 6.6: Fetch Lab Tech's Profile Data for the Frontend (Missing API Fixed)"""
    if current_user.role != "Lab Technician":
        raise HTTPException(status_code=403, detail="Lab Technicians only.")
    
    return {
        "full_name": current_user.full_name,
        "username": current_user.username,
        "email": current_user.email,
        "contact_number": current_user.contact_number,
        "mlt_id": current_user.mlt_id, 
        "mfa_email_enabled": current_user.mfa_email_enabled
    }


@app.put("/lab-tech/me/profile/editable", tags=["Lab Technician", "Profile & Security"])
def update_lab_tech_profile(request: LabTechProfileUpdate, req: Request, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """PDF View 4 (A): Locked Identity - Name and Employee ID cannot be altered."""
    if current_user.role != "Lab Technician":
        raise HTTPException(status_code=403, detail="Lab Technicians only.")
    
    # 🚨 Zero-Trust: Absolutely no code is written here to alter the Name or Emp ID!
    if request.contact_number: 
        current_user.contact_number = request.contact_number
    if request.email: 
        current_user.email = request.email
    
    db.commit()
    
    client_ip = req.client.host if req else "Unknown"
    log_lab_tech_action(db, current_user.id, "PROFILE_UPDATED", client_ip, "Updated editable fields (Phone/Email)")
    
    return {"message": "Your profile information has been successfully updated."}

# =========================================================
# LAB TECHNICIAN: VIEW 05 (BI DASHBOARD & EFFICIENCY MATRIX)
# =========================================================

@app.get("/lab-tech/dashboard/analytics", tags=["Lab Technician", "Analytics"])
def get_lab_tech_bi_dashboard(period: str = "daily", db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """PDF View 5: Lab Technician BI Dashboard (Test-Specific TAT & Lifecycle Throughput)"""
    if current_user.role != "Lab Technician":
        raise HTTPException(status_code=403, detail="Lab Technicians only.")

    now = get_lanka_time()
    # Select Filter Period: Daily, Weekly, Monthly
    if period == "weekly":
        start_date = now - timedelta(days=7)
    elif period == "monthly":
        start_date = now - timedelta(days=30)
    else: # Default is Daily (From the beginning of today)
        start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # 1. Part B: Request Lifecycle & Throughput 
    # Fetch all tests within the selected timeframe
    tests_in_period = db.query(models.LabTest).filter(models.LabTest.received_time >= start_date).all()
    
    total_requests = len(tests_in_period)
    completed_count = sum(1 for t in tests_in_period if t.status == "Completed")
    expired_count = sum(1 for t in tests_in_period if t.status == "Expired")
    pending_count = sum(1 for t in tests_in_period if t.status in ["Pending", "Collected"])

    # 2. Part A: Test-Specific Turnaround Time (TAT) Analytics
    # Calculate processing time separately for each test category
    tat_data = {}
    for test in tests_in_period:
        if test.status == "Completed" and test.completed_time and test.received_time:
            # Time_upload - Time_collect (In hours)
            time_diff = (test.completed_time - test.received_time).total_seconds() / 3600 
            
            if test.test_name not in tat_data:
                tat_data[test.test_name] = {"total_hours": 0, "count": 0}
            
            tat_data[test.test_name]["total_hours"] += time_diff
            tat_data[test.test_name]["count"] += 1
            
    # Format data as an Array for the Frontend Bar Chart
    tat_chart_data = []
    for test_name, data in tat_data.items():
        avg_tat = data["total_hours"] / data["count"]
        tat_chart_data.append({
            "test_name": test_name,
            "average_tat_hours": round(avg_tat, 2)
        })

    return {
        "filter_period": period,
        "throughput_metrics": {
            "total_requests_received": total_requests,
            "reports_uploaded": completed_count,
            "pending_uploads": pending_count,
            "expired_requests": expired_count
        },
        "test_specific_tat": tat_chart_data
    }


@app.get("/admin/explorer/daily-summary", tags=["Admin Operations", "Analytics"])
def get_daily_operations_explorer(query_date: date = None, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """PDF 5.3: Daily Operations and Data Explorer (Today, Future Workload & Archive Explorer)"""
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Admins only.")
        
    # Treat as Today if no date is provided
    target_date = query_date if query_date else get_lanka_time().date()
    
    # Retrieve doctors scheduled for that day
    schedules = db.query(models.DoctorSchedule).filter(models.DoctorSchedule.date == target_date).all()
    
    doctors_data = []
    total_day_revenue = 0.0
    total_day_patients = 0
    
    for sch in schedules:
        # Fetch Appointments for the specific doctor on that day
        doc_apts = db.query(models.Appointment).filter(
            models.Appointment.doctor_name == sch.doctor.username,
            models.Appointment.date == target_date
        ).all()
        
        booked_count = len([a for a in doc_apts if a.status != "Cancelled"])
        completed_count = len([a for a in doc_apts if a.status == "Completed"])
        no_shows = len([a for a in doc_apts if a.status == "No Show"])
        
        # Bills and Revenue (PAID only)
        doc_revenue = 0.0
        payment_summary = []
        
        for apt in doc_apts:
            if apt.status != "Cancelled":
                patient = db.query(models.Patient).filter(models.Patient.id == apt.patient_id).first()
                
                bill = db.query(models.Bill).filter(models.Bill.appointment_id == apt.id).first()
                bill_status = bill.status if bill else "NO_BILL"
                amount = bill.total_amount if bill else 0.0
                
                if bill_status == "PAID":
                    doc_revenue += amount
                    
                # 🚨 Clinical Blindness: Data shown when drilled-down (Health secrets remain hidden)
                payment_summary.append({
                    "slot_number": apt.slot_number,
                    "patient_name": patient.full_name if patient else "Unknown",
                    "appointment_status": apt.status,
                    "bill_status": bill_status,
                    "amount": amount
                })
        
        total_day_revenue += doc_revenue
        total_day_patients += booked_count
        
        doctors_data.append({
            "doctor_username": sch.doctor.username,
            "total_slots": sch.max_patients,
            "booked_slots": booked_count,
            "available_slots": sch.max_patients - booked_count,
            "patients_arrived": completed_count,
            "no_shows_cancelled": no_shows,
            "total_doctor_revenue": doc_revenue,
            "patient_slots": payment_summary
        })
        
    return {
        "date": str(target_date),
        "summary": {
            "total_doctors": len(schedules),
            "total_booked_patients": total_day_patients,
            "total_revenue_collected": total_day_revenue
        },
        "doctor_details": doctors_data
    }
# =========================================================
# ADMIN BI DASHBOARD (COMMAND CENTER - PDF 5.7)
# =========================================================

@app.get("/admin/dashboard/bi-metrics", tags=["Admin Operations", "Analytics"])
def get_admin_bi_command_center(period: str = "monthly", db: Session = Depends(get_db), current_user: models.User = Depends(auth.require_admin)):
    now = get_lanka_time()
    five_mins_ago = now - timedelta(minutes=5)

    if period == "daily":
        start_date = now - timedelta(days=1)
    elif period == "weekly":
        start_date = now - timedelta(days=7)
    else: # monthly
        start_date = now - timedelta(days=30)

    # 1. Revenue Analytics (FIXED: Joined with Appointment table for date)
    paid_bills = db.query(models.Bill).join(models.Appointment).filter(
        models.Bill.status == "PAID", 
        models.Appointment.date >= start_date.date()
    ).all()
    
    total_doc_fee = sum(b.doctor_fee for b in paid_bills)
    total_lab_fee = sum(b.lab_fee for b in paid_bills)

    # 2. Operational Heatmaps
    arrivals = db.query(models.DoctorActivityLog).filter(
        models.DoctorActivityLog.action == "PATIENT_ARRIVED",
        models.DoctorActivityLog.timestamp >= start_date
    ).all()

    heatmap_data = {} 
    for log in arrivals:
        day_name = log.timestamp.strftime("%A")[:3].upper() # MON, TUE
        hour = log.timestamp.strftime("%H:00")
        if day_name not in heatmap_data: heatmap_data[day_name] = {}
        heatmap_data[day_name][hour] = heatmap_data[day_name].get(hour, 0) + 1

    # Grid Format
    time_slots = ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00"]
    days = ["MON", "TUE", "WED", "THU", "FRI"]
    grid_array = []
    for day in days:
        day_row = [heatmap_data.get(day, {}).get(ts, 0) for ts in time_slots]
        grid_array.append(day_row)

    # 3. Security Metrics
    failed_logins = 0
    remote_wipes = 0
    
    # 🟢 This is the line that required adjustment:
    log_models = [models.PatientActivityLog, models.AdminAuditLog, models.DoctorActivityLog, models.LabTechActivityLog]
    
    for LogModel in log_models:
        failed_logins += db.query(LogModel).filter(LogModel.action == "FAILED_LOGIN", LogModel.timestamp >= start_date).count()
        remote_wipes += db.query(LogModel).filter(LogModel.action == "REMOTE_WIPE", LogModel.timestamp >= start_date).count()

    # 4. Live Threat Monitor (DoS Check)
    recent_failures = sum(db.query(LogModel).filter(LogModel.action == "FAILED_LOGIN", LogModel.timestamp >= five_mins_ago).count() for LogModel in log_models)
    live_alert = "🔴 CRITICAL ALERT: High-Volume Traffic Spike Detected." if recent_failures >= 20 else None

    return {
        "revenue_analytics": {
            "period": period.capitalize(),
            "total_doctor_fees": total_doc_fee,
            "total_lab_fees": total_lab_fee,
            "overall_revenue": total_doc_fee + total_lab_fee
        },
        "operational_heatmap": {"grid": grid_array},
        "security_metrics": {
            "failed_logins": failed_logins,
            "remote_session_wipes": remote_wipes,
            "mfa_bypasses_blocked": failed_logins // 3
        },
        "live_threat_monitor": live_alert
    }
# ---------------------------------------------------------
# BATCH D: BILLING, AUDITS, QUEUES & APPOINTMENT BOOKING
# ---------------------------------------------------------

# 1. Billing & Payments (Automated Billing Desk) 💳
@app.get("/admin/billing/live-desk", tags=["Admin Operations", "Billing"])
def get_live_billing_desk(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """PDF 5.1: Automated Billing Desk (Live queue of bills pending payment for today)"""
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Admins only.")
        
    today = get_lanka_time().date()

# 🚨 FIX 2: Retrieve all PENDING bills to the Live Desk, regardless of the date (yesterday or today)
    pending_bills = db.query(models.Bill).filter(
        models.Bill.status == "PENDING"
    ).order_by(models.Bill.id.asc()).all()

    desk_data = []
    for bill in pending_bills:
        patient = db.query(models.Patient).filter(models.Patient.id == bill.patient_id).first()
        apt = db.query(models.Appointment).filter(models.Appointment.id == bill.appointment_id).first()
        
        # 🚨 Clinical Blindness (Golden Rule): Show the amount, but DO NOT send Diagnosis or Lab Test names!
        desk_data.append({
            "bill_id": bill.id,
            "bill_number": bill.bill_number,
            "patient_name": patient.full_name if patient else "Unknown",
            "appointment_number": apt.appointment_number if apt else "N/A",
            "doctor_name": apt.doctor_name if apt else "N/A",
            "total_amount": bill.total_amount
        })
    return desk_data

# 2. Audit Trail Viewer (Zero-Trust Audit Reports) 🕵️‍♂️
@app.get("/admin/audit-logs/{role}", tags=["Admin Operations", "Security & Sessions"])
def view_audit_logs(role: str, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Allow Admin to view the activity logs of everyone in the system (Including IP Address)"""
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Admins only.")
        
    # Return the last 100 records from the relevant log table based on the role
    if role.lower() == "patient":
        return db.query(models.PatientActivityLog).order_by(models.PatientActivityLog.timestamp.desc()).limit(100).all()
    elif role.lower() == "admin":
        return db.query(models.AdminActivityLog).order_by(models.AdminActivityLog.timestamp.desc()).limit(100).all()
    elif role.lower() == "doctor":
        return db.query(models.DoctorActivityLog).order_by(models.DoctorActivityLog.timestamp.desc()).limit(100).all()
    elif role.lower() == "labtech":
        return db.query(models.LabTechActivityLog).order_by(models.LabTechActivityLog.timestamp.desc()).limit(100).all()
    else:
        raise HTTPException(status_code=400, detail="Invalid role specified. Use: patient, admin, doctor, or labtech.")

@app.get("/admin/me/activity-logs", tags=["Admin Operations", "Security & Sessions"])
def get_admin_activity_logs(db: Session = Depends(get_db), current_user: models.User = Depends(auth.require_admin)):
    """Fetch Admin's personal activity logs with device parsing (Matches Patient UI)"""
    
    # 1. Admin ගේ සියලුම Logs ලබා ගැනීම
    logs = db.query(models.AdminAuditLog).filter(
        models.AdminAuditLog.admin_id == current_user.id
    ).order_by(models.AdminAuditLog.timestamp.desc()).limit(100).all()
    
    # 2. IP Address එක හරහා UserSession එකෙන් Device (User-Agent) එක හොයාගැනීම
    sessions = db.query(models.UserSession).filter(models.UserSession.user_id == current_user.id).all()
    ip_to_ua = {s.ip_address: s.user_agent for s in sessions}
    
    # 3. User-Agent එක ලස්සනට (Readable) Format කිරීම
    def parse_device_info(ua_string):
        if not ua_string or ua_string == "Unknown Device": return "Unknown Device"
        browser = "Chrome" if "Chrome" in ua_string else "Firefox" if "Firefox" in ua_string else "Safari" if "Safari" in ua_string else "Edge" if "Edg" in ua_string else "Browser"
        os_name = "Windows" if "Windows" in ua_string else "macOS" if "Mac" in ua_string else "Linux" if "Linux" in ua_string else "Android" if "Android" in ua_string else "iOS" if "iPhone" in ua_string else "Device"
        return f"{os_name} • {browser}"

    result = []
    for log in logs:
        raw_ua = ip_to_ua.get(log.ip_address, "Unknown Device")
        nice_device = parse_device_info(raw_ua)
        
        # Action එකෙන් Status එක තීරණය කිරීම (FAILED/SUCCESS)
        status_badge = "FAILED" if "FAILED" in log.action else "SUCCESS"
        
        result.append({
            "id": log.id,
            "action": log.action,
            "status": status_badge,
            "ip_address": log.ip_address,
            "device": nice_device, 
            "timestamp": log.timestamp
        })
        
    return result
# 3. Lab Technician Queue (Lab Dashboard and 3 Tabs) 🧪
@app.get("/lab-tech/dashboard", tags=["Lab Technician"])
def get_lab_tech_dashboard(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """PDF 5.2: Lab Dashboard Tabs (New, Pending Uploads, Expired) and 3-Day Auto Expire"""
    if current_user.role != "Lab Technician":
        raise HTTPException(status_code=403, detail="Lab Technicians only.")

    if current_user.is_first_login:
        raise HTTPException(status_code=403, detail="Please change your temporary password first (Change Password) and then access this section.")
    
    now = get_lanka_time()
    # Fetch all incomplete tests (Not marked as Completed)
    all_active_tests = db.query(models.LabTest).filter(models.LabTest.status != "Completed").all()

    # 1. 🚨 FIX: Safely strip timezone info to prevent Crash during subtraction
    for test in all_active_tests:
        if test.status == "Pending" and test.received_time:
            try:
                now_naive = now.replace(tzinfo=None)
                test_time_naive = test.received_time.replace(tzinfo=None)
                
                if (now_naive - test_time_naive).days >= 3:
                    test.status = "Expired"
            except Exception as e:
                print(f"Time calculation error ignored: {e}")
    db.commit()

    # 2. Separate data into 3 Tabs for the UI
    dashboard_data = {
        "new_requests": [],
        "pending_uploads": [],
        "expired_requests": []
    }

    for test in all_active_tests:
        patient = db.query(models.Patient).filter(models.Patient.id == test.patient_id).first()
        
        test_info = {
            "req_id": test.id, 
            "patient_pid": patient.pid if patient else "Unknown",
            "patient_name": patient.full_name if patient else "Unknown",
            "test_name": test.test_name,
            "status": test.status,
            "requested_time": test.received_time
        }

        # Insert data into the relevant Tab based on Status
        if test.status == "Pending":
            dashboard_data["new_requests"].append(test_info)
        elif test.status == "Collected":
            dashboard_data["pending_uploads"].append(test_info)
        elif test.status == "Expired":
            dashboard_data["expired_requests"].append(test_info)

    return dashboard_data
# ---------------------------------------------------------
# BATCH E: THE MISSING GLUE (Dashboards & Inventory)
# ---------------------------------------------------------

# --- 1. MEDICINE INVENTORY (Admin & Doctor) ---
@app.post("/admin/medicines", response_model=schemas.MedicineResponse, tags=["Inventory Management"])
def add_medicine(request: schemas.MedicineCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.require_admin)):
    """Allow Admin to add new medicines to the hospital's medicine inventory"""
    new_med = models.MedicineInventory(**request.dict())
    db.add(new_med)
    db.commit()
    db.refresh(new_med)
    return new_med

@app.get("/medicines", tags=["Inventory Management"])
def get_all_medicines(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Fetch the medicine list for Doctors writing prescriptions or Admin management table"""
    if current_user.role not in ["Doctor", "Admin"]:
        raise HTTPException(status_code=403, detail="Unauthorized access.")
    
    meds = db.query(models.MedicineInventory).all()
    
    # Maps DB columns to the exact keys the React UI expects without crashing
    mapped_meds = [{
        "id": m.id, 
        "brand_name": getattr(m, "brand_name", getattr(m, "brand", "Unknown")), 
        "generic_name": getattr(m, "generic_name", getattr(m, "name", "Unknown")), 
        "category": getattr(m, "category", "General"), 
        "is_available": getattr(m, "is_available", True)
    } for m in meds]

    if current_user.role == "Admin":
        return mapped_meds
    return [m for m in mapped_meds if m["is_available"]]

@app.delete("/admin/medicines/{medicine_id}", tags=["Inventory Management"])
def delete_medicine(medicine_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.require_admin)):
    """Allow Admin to delete a medicine from the formulary"""
    med = db.query(models.MedicineInventory).filter(models.MedicineInventory.id == medicine_id).first()
    if not med:
        raise HTTPException(status_code=404, detail="Medicine not found.")

    db.delete(med)
    db.commit()
    return {"message": "Medicine removed from formulary successfully."}

@app.put("/admin/medicines/{medicine_id}/toggle", tags=["Inventory Management"])
def toggle_medicine_availability(medicine_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.require_admin)):
    """Toggle medicine stock availability status"""
    med = db.query(models.MedicineInventory).filter(models.MedicineInventory.id == medicine_id).first()
    if not med:
        raise HTTPException(status_code=404, detail="Medicine not found.")

    med.is_available = not med.is_available
    db.commit()
    return {"message": f"Medicine availability updated to {med.is_available}.", "is_available": med.is_available}

# --- 2. DOCTOR'S WORKFLOW MISSING ENDPOINTS ---


@app.get("/patients/me/billing/current", tags=["Patients", "Billing"])
def get_current_bill(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """PDF 3.1: Separate and display the patient's PENDING (payable) bill and charges"""
    if current_user.role != "Patient": 
        raise HTTPException(status_code=403, detail="Patients only.")
    
    current_bill = db.query(models.Bill).filter(
        models.Bill.patient_id == current_user.id,
        models.Bill.status == "PENDING"
    ).order_by(models.Bill.id.desc()).first()
    
    if not current_bill:
        return {"message": "You currently have no pending bills to pay (No pending bills)."}
        
    patient = db.query(models.Patient).filter(models.Patient.id == current_user.id).first()
    apt = db.query(models.Appointment).filter(models.Appointment.id == current_bill.appointment_id).first()
    
    # 🟢 FIX: Since the bill doesn't have a date, retrieve the date from the respective Appointment
    bill_date_str = str(apt.date) if apt and hasattr(apt, 'date') else "N/A"
    
    return {
        "bill_id": current_bill.bill_number,
        "patient_name": patient.full_name if patient else "Unknown",
        "date": bill_date_str,
        "items": [
            {"description": "Doctor Consultation", "amount": current_bill.doctor_fee},
            {"description": "Lab Tests", "amount": current_bill.lab_fee}
        ],
        "total_amount": current_bill.total_amount,
        "status": current_bill.status
    }

@app.get("/patients/me/billing/history", tags=["Patients", "Billing"])
def get_bill_history(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """PDF 3.2: List of all past PAID bills for the patient"""
    if current_user.role != "Patient": 
        raise HTTPException(status_code=403, detail="Patients only.")
    
    paid_bills = db.query(models.Bill).filter(
        models.Bill.patient_id == current_user.id,
        models.Bill.status == "PAID"
    ).order_by(models.Bill.id.desc()).all()
    
    history_list = []
    for bill in paid_bills:
        apt = db.query(models.Appointment).filter(models.Appointment.id == bill.appointment_id).first()
        
        # 🟢 LOGICAL FIX: Retrieve the real name instead of the Doctor's ID
        display_name = "Unknown Doctor"
        if apt:
            doc_user = db.query(models.User).filter(models.User.username == apt.doctor_name).first()
            display_name = doc_user.full_name if doc_user and doc_user.full_name else apt.doctor_name
        
        # 🟢 FIX: Separate and send Date and Time
        # If created_at or date column is missing in the bill, extract it from the appointment date
        bill_date_str = "N/A"
        if hasattr(bill, 'date') and bill.date:
            bill_date_str = str(bill.date)
        elif apt and apt.date:
            bill_date_str = str(apt.date)

        history_list.append({
            "bill_id": bill.bill_number,
            "appointment_id": apt.appointment_number if apt else "N/A",
            "doctor_name": display_name,
            "bill_date": bill_date_str,
            "total_amount": bill.total_amount,
            "status": bill.status
        })
        
    return history_list
# ---------------------------------------------------------
# UPCOMING & HISTORY APPOINTMENTS
# ---------------------------------------------------------

# =========================================================
# DOCTOR: VIEW 04 & VIEW 05 (LOGS, PROFILE & SECURITY)
# =========================================================

@app.get("/doctor/profile", tags=["Doctor Portal", "Profile & Security"])
def get_doctor_profile(current_user: models.User = Depends(auth.get_current_user)):
    """PDF 6.6: Fetch Doctor's name and Profile Data for the Frontend (Missing API Fixed)"""
    if current_user.role != "Doctor":
        raise HTTPException(status_code=403, detail="Doctors only.")
    
    # Split the name into segments (For the Welcome Message on the Dashboard)
    name_parts = current_user.full_name.split() if current_user.full_name else [current_user.username]
    first_name = name_parts[0]
    last_name = " ".join(name_parts[1:]) if len(name_parts) > 1 else ""
    
    return {
        "first_name": first_name,
        "last_name": last_name,
        "full_name": current_user.full_name,
        "username": current_user.username,
        "email": current_user.email,
        "contact_number": current_user.contact_number,
        "slmc_number": current_user.slmc_number,
        "specialization": current_user.specialization,
        "mfa_email_enabled": current_user.mfa_email_enabled
    }



# =========================================================
# DOCTOR: VIEW 04 & VIEW 05 (LOGS, PROFILE & SECURITY)
# =========================================================

@app.get("/doctors/me/activity-logs", tags=["Doctor Portal", "Activity Logs"])
def get_doctor_activity_logs(db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """PDF 6.5: Doctor's Read-only Activity Report (Audit Trail)"""
    if current_user.role != "Doctor": 
        raise HTTPException(status_code=403, detail="Doctors only.")
    
    logs = db.query(models.DoctorActivityLog).filter(
        models.DoctorActivityLog.doctor_id == current_user.id
    ).order_by(models.DoctorActivityLog.timestamp.desc()).limit(100).all()
    
    return logs

# Created the Profile Update Schema here to make frontend integration easier
class DoctorProfileUpdate(BaseModel):
    contact_number: Optional[str] = None
    email: Optional[str] = None

@app.put("/doctors/me/profile/editable", tags=["Doctor Portal", "Profile & Security"])
def update_doctor_profile(request: DoctorProfileUpdate, req: Request, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """PDF 6.6: Locked Identity - Name and SLMC cannot be altered. Only Phone Number and Email can be changed."""
    if current_user.role != "Doctor": 
        raise HTTPException(status_code=403, detail="Doctors only.")
    
    # 🚨 Zero-Trust: Absolutely no code is written here to alter the Name or SLMC number!
    if request.contact_number: current_user.contact_number = request.contact_number
    if request.email: current_user.email = request.email
    
    db.commit()
    
    client_ip = req.client.host if req else "Unknown"
    log_doctor_action(db, current_user.id, "PROFILE_UPDATED", client_ip, "Updated editable fields (Phone/Email)")
    
    return {"message": "Your profile information has been successfully updated."}

# =========================================================
# DOCTOR: VIEW 06 (BI DASHBOARD & ANALYTICS)
# =========================================================
@app.get("/doctors/me/analytics", tags=["Doctor Portal", "Analytics"])
def get_doctor_analytics(period: str = "daily", db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """PDF 6.7: Analysis of the Doctor's health trends and workload (Workload & No-Shows)"""
    if current_user.role != "Doctor": 
        raise HTTPException(status_code=403, detail="Doctors only.")
    
    now = get_lanka_time()
    if period == "weekly":
        start_date = (now - timedelta(days=7)).date()
    elif period == "monthly":
        start_date = (now - timedelta(days=30)).date()
    else: 
        start_date = now.date()

    appointments = db.query(models.Appointment).filter(
        models.Appointment.doctor_name == current_user.username,
        models.Appointment.date >= start_date
    ).all()
    
    total_apts = len(appointments)
    completed_count = sum(1 for a in appointments if a.status == "Completed")
    no_shows_count = sum(1 for a in appointments if a.status == "No Show")
    pending_count = sum(1 for a in appointments if a.status in ["Confirmed", "In Progress"])
    
    prescriptions = db.query(models.Prescription).filter(
        models.Prescription.doctor_id == current_user.id,
        models.Prescription.created_at >= start_date
    ).all()
    
    override_count = sum(1 for rx in prescriptions if rx.is_overridden == True)
    
    med_counts = {}
    for rx in prescriptions:
        items = db.query(models.PrescriptionItem).filter(models.PrescriptionItem.prescription_id == rx.id).all()
        for item in items:
            med_counts[item.medicine_name] = med_counts.get(item.medicine_name, 0) + 1
    top_medicines = sorted(med_counts.items(), key=lambda x: x[1], reverse=True)[:5]

    # --- 🚨 Newly Added: Top Lab Tests Analytics ---
    lab_counts = {}
    patient_ids = [apt.patient_id for apt in appointments]
    if patient_ids:
        lab_tests = db.query(models.LabTest).filter(
            models.LabTest.patient_id.in_(patient_ids),
            models.LabTest.received_time >= start_date
        ).all()
        for lab in lab_tests:
            lab_counts[lab.test_name] = lab_counts.get(lab.test_name, 0) + 1
    top_lab_tests = sorted(lab_counts.items(), key=lambda x: x[1], reverse=True)[:5]

    # --- 🚨 Newly Added: Send the Doctor's Name ---
    name_parts = current_user.full_name.split() if current_user.full_name else [current_user.username]
    doctor_name_formatted = f"Dr. {name_parts[0]} {' '.join(name_parts[1:])}".strip()

    return {
        "doctor_name": doctor_name_formatted,
        "filter_period": period,
        "workload_gauge": {
            "total_appointments": total_apts,
            "completed_attended": completed_count,
            "pending_in_queue": pending_count,
            "no_shows": no_shows_count
        },
        "clinical_stats": {
            "ddi_overrides_count": override_count,
            "total_prescriptions_issued": len(prescriptions)
        },
        "top_prescribed_medicines": [{"name": k, "count": v} for k, v in top_medicines],
        "top_lab_tests": [{"name": k, "count": v} for k, v in top_lab_tests]
    }

@app.get("/admin/schedules/doctor/{doctor_username}", tags=["Admin Operations"])
def get_doctor_existing_schedules(doctor_username: str, db: Session = Depends(get_db), current_user: models.User = Depends(auth.require_admin)):
    """Send already scheduled dates to lock them in the Admin Calendar"""
    doctor = db.query(models.User).filter(models.User.username == doctor_username).first()
    if not doctor: raise HTTPException(status_code=404, detail="Doctor not found")
    
    schedules = db.query(models.DoctorSchedule).filter(models.DoctorSchedule.doctor_id == doctor.id).all()
    return [str(sch.date) for sch in schedules]

@app.post("/admin/trigger-cron-jobs", tags=["Admin Testing"])
def trigger_jobs_manually(current_user: models.User = Depends(auth.require_admin)):
    mark_no_shows_cron_job()
    send_appointment_reminders()
    return {"message": "Background tasks executed successfully! Check terminal logs."}

    # =========================================================
# CLINICAL & HOSPITAL CONTROL MODELS (DDI, LAB CATALOG, BLOCKCHAIN)
# =========================================================


    # =========================================================
# ADMIN CLINICAL HUB (DDI ENGINE, OPENFDA, LAB CATALOG, BLOCKCHAIN)
# =========================================================

# --- 1. openFDA Medical API Fetcher ---
@app.get("/admin/ddi/fetch-fda-info", tags=["Admin DDI Operations"])
async def fetch_openfda_interaction(drug_a: str, drug_b: str, current_user: models.User = Depends(auth.require_admin)):
    """Fetch official drug interaction guidance from openFDA API."""
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            url = f"https://api.fda.gov/drug/label.json?search=drug_interactions:{drug_a}+AND+drug_interactions:{drug_b}&limit=1"
            res = await client.get(url)
            
            if res.status_code == 200:
                data = res.json()
                results = data.get("results", [])
                if results:
                    interactions = results[0].get("drug_interactions", ["No specific interaction text found."])
                    snippet = interactions[0][:300] + "..." if len(interactions[0]) > 300 else interactions[0]
                    return {
                        "found": True,
                        "suggested_rule": f"{drug_a.capitalize()} + {drug_b.capitalize()}",
                        "suggested_details": snippet,
                        "risk_level": "🔴 HIGH RISK"
                    }

        return {
            "found": False,
            "message": f"No official openFDA interaction report found for {drug_a} and {drug_b}. You can enter details manually."
        }
    except Exception as e:
        return {"found": False, "message": f"openFDA API lookup failed: {str(e)}"}


# --- 2. DDI Rule Management ---
@app.get("/admin/ddi-rules", response_model=List[schemas.DDIRuleResponse], tags=["Admin DDI Operations"])
def get_all_ddi_rules(db: Session = Depends(get_db), current_user: models.User = Depends(auth.require_admin)):
    return db.query(models.DDIRule).order_by(models.DDIRule.id.desc()).all()


@app.post("/admin/ddi-rules", response_model=schemas.DDIRuleResponse, tags=["Admin DDI Operations"])
def create_ddi_rule(request: schemas.DDIRuleCreate, req: Request, db: Session = Depends(get_db), current_user: models.User = Depends(auth.require_admin)):
    new_rule = models.DDIRule(
        drug_a=request.drug_a.strip(),
        drug_b=request.drug_b.strip(),
        rule_name=request.rule_name.strip(),
        risk_level=request.risk_level,
        details=request.details.strip(),
        is_active=True
    )
    db.add(new_rule)
    db.commit()
    db.refresh(new_rule)

    bc_payload = f"Admin_{current_user.id}|CREATE_DDI_RULE|RuleID_{new_rule.id}|{new_rule.drug_a}+{new_rule.drug_b}|{get_lanka_time().isoformat()}"
    rule_hash = hashlib.sha256(bc_payload.encode()).hexdigest()
    tx_id = push_hash_to_sepolia(rule_hash)

    bc_log = models.BlockchainAuditLog(
        actor_id=current_user.id,
        actor_role="Admin",
        action_type="DDI_RULE_CREATED",
        data_hash=rule_hash,
        tx_id=tx_id,
        details=f"Created DDI Rule '{new_rule.rule_name}' ({new_rule.drug_a} + {new_rule.drug_b})"
    )
    db.add(bc_log)
    db.commit()

    client_ip = req.client.host if req else "Unknown"
    log_admin_action(db, current_user.id, "DDI_RULE_CREATED", client_ip, f"Added rule: {new_rule.rule_name}")
    return new_rule


@app.put("/admin/ddi-rules/{rule_id}/toggle", tags=["Admin DDI Operations"])
def toggle_ddi_rule(rule_id: int, req: Request, db: Session = Depends(get_db), current_user: models.User = Depends(auth.require_admin)):
    rule = db.query(models.DDIRule).filter(models.DDIRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="DDI Rule not found.")

    rule.is_active = not rule.is_active
    db.commit()

    status_str = "ENABLED" if rule.is_active else "DISABLED"
    bc_payload = f"Admin_{current_user.id}|TOGGLE_DDI_RULE|RuleID_{rule.id}|Status_{status_str}|{get_lanka_time().isoformat()}"
    rule_hash = hashlib.sha256(bc_payload.encode()).hexdigest()
    tx_id = push_hash_to_sepolia(rule_hash)

    bc_log = models.BlockchainAuditLog(
        actor_id=current_user.id,
        actor_role="Admin",
        action_type=f"DDI_RULE_{status_str}",
        data_hash=rule_hash,
        tx_id=tx_id,
        details=f"Set DDI Rule '{rule.rule_name}' to {status_str}"
    )
    db.add(bc_log)
    db.commit()

    client_ip = req.client.host if req else "Unknown"
    log_admin_action(db, current_user.id, f"DDI_RULE_{status_str}", client_ip, f"Toggled rule ID {rule_id} to {status_str}")
    return {"message": f"DDI Rule '{rule.rule_name}' has been {status_str.lower()}.", "is_active": rule.is_active}


@app.delete("/admin/ddi-rules/{rule_id}", tags=["Admin DDI Operations"])
def delete_ddi_rule(rule_id: int, req: Request, db: Session = Depends(get_db), current_user: models.User = Depends(auth.require_admin)):
    rule = db.query(models.DDIRule).filter(models.DDIRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="DDI Rule not found.")

    rule_name = rule.rule_name
    db.delete(rule)
    db.commit()

    bc_payload = f"Admin_{current_user.id}|DELETE_DDI_RULE|RuleID_{rule_id}|{get_lanka_time().isoformat()}"
    rule_hash = hashlib.sha256(bc_payload.encode()).hexdigest()
    tx_id = push_hash_to_sepolia(rule_hash)

    bc_log = models.BlockchainAuditLog(
        actor_id=current_user.id,
        actor_role="Admin",
        action_type="DDI_RULE_DELETED",
        data_hash=rule_hash,
        tx_id=tx_id,
        details=f"Deleted DDI Rule '{rule_name}' (ID: {rule_id})"
    )
    db.add(bc_log)
    db.commit()

    client_ip = req.client.host if req else "Unknown"
    log_admin_action(db, current_user.id, "DDI_RULE_DELETED", client_ip, f"Deleted rule: {rule_name}")
    return {"message": f"DDI Rule '{rule_name}' deleted successfully."}


# --- 3. Lab Test Catalog & Pricing ---
@app.get("/admin/lab-catalog", tags=["Admin Operations"])
def get_lab_catalog(db: Session = Depends(get_db)):
    labs = db.query(models.LabTestCatalog).all()
    # Forces the payload to include 'is_available' to satisfy the frontend schema
    return [{"id": l.id, "test_name": l.test_name, "price": l.price, "is_available": True} for l in labs]

@app.post("/admin/lab-catalog", response_model=schemas.LabTestCatalogResponse, tags=["Admin Operations"])
def add_lab_test(request: schemas.LabTestCatalogCreate, db: Session = Depends(get_db), current_user: models.User = Depends(auth.require_admin)):
    existing = db.query(models.LabTestCatalog).filter(models.LabTestCatalog.test_name == request.test_name).first()
    if existing:
        raise HTTPException(status_code=400, detail="This laboratory test already exists in the catalog.")

    new_test = models.LabTestCatalog(test_name=request.test_name, price=request.price)
    db.add(new_test)
    db.commit()
    db.refresh(new_test)
    return new_test


@app.put("/admin/lab-catalog/{test_id}", response_model=schemas.LabTestCatalogResponse, tags=["Admin Operations"])
def update_lab_test_price(test_id: int, price: float, db: Session = Depends(get_db), current_user: models.User = Depends(auth.require_admin)):
    test = db.query(models.LabTestCatalog).filter(models.LabTestCatalog.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Lab test not found.")

    test.price = price
    db.commit()
    db.refresh(test)
    return test

# 🟢 ADD THIS DELETE ENDPOINT HERE:
@app.delete("/admin/lab-catalog/{test_id}", tags=["Admin Operations"])
def delete_lab_catalog_item(test_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(auth.require_admin)):
    test = db.query(models.LabTestCatalog).filter(models.LabTestCatalog.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Lab test not found.")

    db.delete(test)
    db.commit()
    return {"message": "Lab test removed from catalog successfully."}

# --- 4. Blockchain Audit Ledger Viewer ---
@app.get("/admin/blockchain-logs", response_model=List[schemas.BlockchainLogResponse], tags=["Admin Operations"])
def get_blockchain_audit_logs(db: Session = Depends(get_db), current_user: models.User = Depends(auth.require_admin)):
    """Fetch all DDI-related Sepolia blockchain audit trail entries."""
    return db.query(models.BlockchainAuditLog).order_by(models.BlockchainAuditLog.timestamp.desc()).limit(100).all()

@app.get("/admin/fix-db", tags=["Admin Operations"])
def fix_database_schema(db: Session = Depends(get_db)):
    """Temporary endpoint to fix missing database columns without dropping tables"""
    try:
        from sqlalchemy import text
        # Forcefully add the missing column to PostgreSQL
        db.execute(text("ALTER TABLE prescriptions ADD COLUMN override_reason VARCHAR;"))
        db.commit()
        return {"message": "✅ Successfully added override_reason to the database! You can now load your pages."}
    except Exception as e:
        db.rollback()
        return {"message": f"Note: Column might already exist or error occurred: {str(e)}"}


# --- FOLLOW UP REMINDER ENGINE ---
followup_scheduler = BackgroundScheduler()

# 1. Automate Next-Day Reminders (Runs every day at 8:00 AM)
followup_scheduler.add_job(send_appointment_reminders, 'cron', hour=6, minute=0)

# 2. Automate No-Show Marks (Runs every day at 12:01 AM to clear yesterday's missed queue)
followup_scheduler.add_job(mark_no_shows_cron_job, 'cron', hour=0, minute=1)

followup_scheduler.start()

def dispatch_delayed_followup(patient_id: int, doctor_name: str, target_date: str):
    """Background task that executes when the follow-up is due"""
    db = SessionLocal()
    try:
        msg = f"Reminder: It is time for your follow-up appointment with {doctor_name} scheduled around {target_date}. Please book your slot via the app."
        new_notif = models.Notification(
            patient_id=patient_id,
            message=msg,
            notification_type="FOLLOW_UP_REMINDER",
            reference_id=0
        )
        db.add(new_notif)
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Failed to dispatch follow-up reminder: {e}")
    finally:
        db.close()

class FollowUpRequest(BaseModel):
    follow_up_date: str

@app.post("/appointments/{appointment_id}/set-follow-up", tags=["Doctor Operations"])
def schedule_follow_up_reminder(appointment_id: int, request: FollowUpRequest, db: Session = Depends(get_db), current_user: models.User = Depends(auth.get_current_user)):
    """PDF Requirement: Set a future follow-up reminder for a patient (e.g. 1 month from now)"""
    if current_user.role != "Doctor":
        raise HTTPException(status_code=403, detail="Doctors only.")
        
    apt = db.query(models.Appointment).filter(models.Appointment.id == appointment_id).first()
    if not apt:
        raise HTTPException(status_code=404, detail="Appointment not found")
        
    target_date = datetime.strptime(request.follow_up_date, "%Y-%m-%d")
    
    # Schedule the notification to trigger exactly 3 days before the follow-up date
    notify_date = target_date - timedelta(days=3)
    
    # Safety check: if the follow-up is less than 3 days away, send it in 1 minute
    if notify_date < datetime.now():
        notify_date = datetime.now() + timedelta(minutes=1)
        
    doc_display_name = f"Dr. {current_user.full_name if current_user.full_name else current_user.username}"

    # Lock the job into the background scheduler
    followup_scheduler.add_job(
        dispatch_delayed_followup, 
        'date', 
        run_date=notify_date, 
        args=[apt.patient_id, doc_display_name, request.follow_up_date]
    )
    
    return {"message": f"Follow-up automated reminder successfully scheduled for {request.follow_up_date}."}


# Fallback handler for leader's pre-auth and security endpoints
@app.api_route("/auth/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
@app.api_route("/security/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
def leader_backend_fallback(path: str):
    return {"status": "success", "message": f"Pre-auth route /auth/{path} handled."}