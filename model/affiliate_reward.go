package model

import (
	"errors"
	"math"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

// AffiliateReward records actual registration rewards issued after migration.
// Historical cumulative balances cannot be reliably reconstructed per invitee.
type AffiliateReward struct {
	Id            int   `json:"id"`
	UserId        int   `json:"-" gorm:"index:idx_aff_reward_user_id,priority:1"`
	InvitedUserId int   `json:"-" gorm:"uniqueIndex"`
	Quota         int   `json:"quota"`
	CreatedAt     int64 `json:"created_at" gorm:"bigint;index:idx_aff_reward_user_id,priority:2"`
}

// AwardAffiliateRegistrationReward keeps the award and cumulative balance in
// one transaction. A retried account finalization cannot award an invitee twice.
func AwardAffiliateRegistrationReward(inviterID, invitedID, quota int) (bool, error) {
	if inviterID <= 0 || invitedID <= 0 || inviterID == invitedID || quota <= 0 || quota > common.MaxWalletQuota {
		return false, common.NewMessage("Invalid referral reward")
	}
	awarded := false
	err := DB.Transaction(func(tx *gorm.DB) error {
		// Serialize awards for the inviter before checking the unique invitee.
		// Do not infer insertion from RowsAffected on an upsert: MySQL's
		// clientFoundRows option reports a no-op duplicate as an affected row.
		var inviter User
		if err := lockForUpdate(tx).Select("id").First(&inviter, inviterID).Error; err != nil {
			return err
		}
		var existing AffiliateReward
		err := tx.Where("invited_user_id = ?", invitedID).Take(&existing).Error
		if err == nil {
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		var invited User
		if err := tx.Select("id, inviter_id").First(&invited, invitedID).Error; err != nil {
			return err
		}
		if invited.InviterId != inviterID {
			return common.NewMessage("Invalid referral reward")
		}
		reward := AffiliateReward{UserId: inviterID, InvitedUserId: invitedID, Quota: quota, CreatedAt: common.GetTimestamp()}
		if err := tx.Create(&reward).Error; err != nil {
			return err
		}
		result := tx.Model(&User{}).
			Where("id = ? AND aff_quota <= ? AND aff_history <= ? AND aff_count < ?", inviterID, common.MaxWalletQuota-quota, common.MaxWalletQuota-quota, math.MaxInt32).
			Updates(map[string]any{
				"aff_count": gorm.Expr("aff_count + ?", 1), "aff_quota": gorm.Expr("aff_quota + ?", quota), "aff_history": gorm.Expr("aff_history + ?", quota),
			})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return common.NewMessage("Referral reward balance limit exceeded")
		}
		awarded = true
		return nil
	})
	return awarded && err == nil, err
}

func GetAffiliateRewards(userID int, pageInfo *common.PageInfo) ([]AffiliateReward, int64, error) {
	if userID <= 0 {
		return nil, 0, errors.New("invalid user")
	}
	rows := make([]AffiliateReward, 0)
	var total int64
	if err := DB.Model(&AffiliateReward{}).Where("user_id = ?", userID).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	lastPage := max(1, (int(total)+pageInfo.PageSize-1)/pageInfo.PageSize)
	pageInfo.Page = min(pageInfo.Page, lastPage)
	err := DB.Where("user_id = ?", userID).Order("id DESC").Offset(pageInfo.GetStartIdx()).Limit(pageInfo.GetPageSize()).Find(&rows).Error
	return rows, total, err
}
