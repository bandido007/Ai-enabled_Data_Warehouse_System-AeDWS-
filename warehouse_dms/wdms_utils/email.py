import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from django.template.loader import render_to_string
from dotenv import dotenv_values
from jinja2 import Environment, FileSystemLoader

config = dotenv_values(".env")


class EmailNotifications:
    @staticmethod
    def send_email_notification(email_body: dict, html_template: str, user=None):
        EMAIL_HOST = config.get("EMAIL_HOST", "")
        EMAIL_PASSWORD = config.get("EMAIL_HOST_PASSWORD", "")
        EMAIL_USER = config.get("EMAIL_HOST_USER", "")
        EMAIL_PORT = int(config.get("EMAIL_PORT", 587))
        DEFAULT_FROM_EMAIL = config.get("DEFAULT_FROM_EMAIL", EMAIL_USER)

        html_content = render_to_string(html_template, {"data": email_body})
        env = Environment(loader=FileSystemLoader("."))
        template = env.from_string(html_content)
        rendered_template = template.render({"data": email_body})

        msg = MIMEMultipart()
        msg["From"] = DEFAULT_FROM_EMAIL
        msg["To"] = email_body["receiver_details"]
        msg["Subject"] = email_body["subject"]
        msg.attach(MIMEText(rendered_template, "html"))

        server = smtplib.SMTP(EMAIL_HOST, EMAIL_PORT)
        server.starttls()
        server.login(EMAIL_USER, EMAIL_PASSWORD)
        server.sendmail(DEFAULT_FROM_EMAIL, email_body["receiver_details"], msg.as_string())
        server.quit()
