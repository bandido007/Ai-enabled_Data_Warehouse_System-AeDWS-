import uuid
from django.db import models
from django.contrib.auth.models import User


class BaseModel(models.Model):
    primary_key = models.AutoField(primary_key=True)
    unique_id = models.UUIDField(editable=False, default=uuid.uuid4, unique=True)
    created_date = models.DateField(auto_now_add=True)
    updated_date = models.DateField(auto_now=True)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, null=True)

    @property
    def id(self):
        return self.primary_key

    class Meta:
        abstract = True
