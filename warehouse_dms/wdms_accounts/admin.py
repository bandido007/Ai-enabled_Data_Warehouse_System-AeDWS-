from django.contrib import admin

from .models import ActivateAccountTokenUser, ForgotPasswordRequestUser, UserProfile

admin.site.register(UserProfile)
admin.site.register(ForgotPasswordRequestUser)
admin.site.register(ActivateAccountTokenUser)
